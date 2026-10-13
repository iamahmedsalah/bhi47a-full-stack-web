import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

export interface RequestWithCorrelationId extends Request {
  correlationId?: string;
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const existing =
      req.headers['x-correlation-id'] || req.headers['x-request-id'];
    const correlationId =
      (Array.isArray(existing) ? existing[0] : existing) || randomUUID();

    (req as RequestWithCorrelationId).correlationId = correlationId;
    res.setHeader('x-correlation-id', correlationId);

    next();
  }
}
