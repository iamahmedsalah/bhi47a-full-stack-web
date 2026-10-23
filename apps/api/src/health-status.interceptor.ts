import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

/** Keep operational details behind the authenticated admin metrics endpoints. */
@Injectable()
export class HealthStatusInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<{ status: string }>,
  ): Observable<{ status: string }> {
    return next.handle().pipe(map(({ status }) => ({ status })));
  }
}
