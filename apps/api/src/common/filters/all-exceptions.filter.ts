import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppLoggerService } from '../../core/logger/logger.service';
import { isCorsBlockedError } from '../../config/cors-origins';

type ErrorLike = Error & {
  status?: number;
  errors?: unknown;
  type?: string;
  code?: string;
  customMessage?: string;
};

/** Enrollment conflicts expose counts only, never driver errors or row identifiers. */
function partialWriteSummary(body: unknown) {
  if (!body || typeof body !== 'object' || !('partialWrite' in body)) return;
  const value = body.partialWrite;
  if (!value || typeof value !== 'object') return;
  const data = value as Record<string, unknown>;
  if (data.writeKind !== 'profiles' && data.writeKind !== 'registrations')
    return;
  const fields = [
    'plannedCount',
    'appliedCount',
    'rejectedCount',
    'uncertainCount',
    'unattemptedCount',
  ] as const;
  if (
    !fields.every(
      (field) =>
        typeof data[field] === 'number' &&
        Number.isSafeInteger(data[field]) &&
        data[field] >= 0,
    )
  )
    return;
  return {
    writeKind: data.writeKind,
    ...Object.fromEntries(fields.map((field) => [field, data[field]])),
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const error = exception as ErrorLike;

    const method = request?.method || 'UNKNOWN';
    const url = request?.originalUrl || '';
    const statusMessage =
      exception instanceof HttpException
        ? exception.message
        : error?.message || 'Unhandled exception';

    const logRequestError = (statusCode?: number) => {
      const message = `Request failed on ${method} ${url}`;
      const metadata = {
        context: 'AllExceptionsFilter',
        statusCode,
        method,
        path: url,
        ip: request?.ip,
        userAgent: request?.headers?.['user-agent'],
        message: statusMessage,
      };

      if (statusCode && statusCode < 500) {
        this.logger.warn(message, metadata);
        return;
      }

      this.logger.error(message, error?.stack, metadata);
    };

    if (error?.type === 'entity.parse.failed') {
      logRequestError(HttpStatus.BAD_REQUEST);
      return response.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid JSON payload.',
        timestamp: new Date().toISOString(),
        path: url,
      });
    }

    if (error?.type === 'entity.too.large') {
      logRequestError(HttpStatus.PAYLOAD_TOO_LARGE);
      return response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        success: false,
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        message: 'Request payload is too large.',
        timestamp: new Date().toISOString(),
        path: url,
      });
    }

    if (isCorsBlockedError(error)) {
      logRequestError(HttpStatus.FORBIDDEN);
      return response.status(HttpStatus.FORBIDDEN).json({
        success: false,
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Origin is not allowed by CORS policy.',
        timestamp: new Date().toISOString(),
        path: url,
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      logRequestError(status);
      const body = exception.getResponse();
      const partialWrite = partialWriteSummary(body);
      const message =
        typeof body === 'object' && body !== null && 'message' in body
          ? (body as { message: string | string[] }).message
          : exception.message;

      return response.status(status).json({
        success: false,
        statusCode: status,
        message: Array.isArray(message)
          ? message.join(', ')
          : message || 'Error',
        timestamp: new Date().toISOString(),
        path: url,
        ...(partialWrite ? { partialWrite } : {}),
        ...(typeof body === 'object' && body !== null
          ? {
              ...(typeof (body as any).code === 'string'
                ? { code: (body as any).code }
                : {}),
              ...(typeof (body as any).operation === 'string'
                ? { operation: (body as any).operation }
                : {}),
              ...(typeof (body as any).messageEn === 'string'
                ? { messageEn: (body as any).messageEn }
                : {}),
              ...((body as any).errors ? { errors: (body as any).errors } : {}),
              ...((body as any).locked !== undefined
                ? { locked: (body as any).locked }
                : {}),
              ...((body as any).lockRemainingSeconds !== undefined
                ? { lockRemainingSeconds: (body as any).lockRemainingSeconds }
                : {}),
              ...((body as any).attemptsLeft !== undefined
                ? { attemptsLeft: (body as any).attemptsLeft }
                : {}),
              ...((body as any).lockSecs !== undefined
                ? { lockSecs: (body as any).lockSecs }
                : {}),
              ...((body as any).maxAttempts !== undefined
                ? { maxAttempts: (body as any).maxAttempts }
                : {}),
            }
          : {}),
      });
    }

    if (
      error?.status &&
      Number.isInteger(error.status) &&
      error.status >= 400 &&
      error.status < 600
    ) {
      logRequestError(error.status);
      return response.status(error.status).json({
        success: false,
        statusCode: error.status,
        message: error.message || 'Error',
        timestamp: new Date().toISOString(),
        path: url,
        ...(error.errors ? { errors: error.errors } : {}),
      });
    }

    logRequestError(HttpStatus.INTERNAL_SERVER_ERROR);
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error.',
      timestamp: new Date().toISOString(),
      path: url,
    });
  }
}
