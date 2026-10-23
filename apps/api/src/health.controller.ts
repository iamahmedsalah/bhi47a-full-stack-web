import { Controller, Get, Optional, UseInterceptors } from '@nestjs/common';
import mongoose from 'mongoose';
import { Public } from './modules/auth/decorators/public.decorator';
import { ConnectionHolder } from './common/rate-limit/connection-holder';
import { CacheService } from './core/cache/cache.service';
import { HealthStatusInterceptor } from './health-status.interceptor';

@Controller()
@UseInterceptors(HealthStatusInterceptor)
export class HealthController {
  constructor(@Optional() private readonly cacheService?: CacheService) {}
  @Public()
  @Get()
  root() {
    const isProduction = process.env.NODE_ENV === 'production';
    const isSwaggerAllowed =
      !isProduction || process.env.ENABLE_SWAGGER === 'true';

    return {
      name: 'Student Portal Backend API',
      status: 'online',
      environment: process.env.NODE_ENV || 'development',
      version: process.env.APP_VERSION || '1.0.0',
      timestamp: new Date().toISOString(),
      endpoints: {
        health: '/api/health',
        metrics: '/api/metrics',
        documentation: isSwaggerAllowed
          ? '/api/docs'
          : 'Access Denied (Disabled in production)',
      },
    };
  }

  @Public()
  @Get('health')
  async check() {
    const conn = ConnectionHolder.connection || mongoose.connection;
    const readyState = conn?.readyState ?? 0;
    const isConnected = Number(readyState) === 1;
    let dbStatus = isConnected ? 'connected' : 'disconnected';
    let pingLatencyMs = -1;

    if (isConnected && conn?.db) {
      try {
        const start = process.hrtime.bigint();
        await conn.db.admin().ping();
        const diffNs = Number(process.hrtime.bigint() - start);
        pingLatencyMs = Math.round((diffNs / 1e6) * 100) / 100;
        dbStatus = 'connected';
      } catch (err: any) {
        dbStatus = `ping_failed: ${err?.message || 'unknown'}`;
      }
    }

    return {
      status: dbStatus === 'connected' ? 'ok' : 'degraded',
      environment: process.env.NODE_ENV || 'development',
      version: process.env.APP_VERSION || '1.0.0',
      uptime: process.uptime(),
      database: {
        status: dbStatus,
        pingLatencyMs,
        readyState,
      },
      cache: this.cacheService
        ? this.cacheService.getHealth()
        : { status: 'disabled' },
      timestamp: new Date().toISOString(),
    };
  }
}
