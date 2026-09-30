import { Controller, Get } from '@nestjs/common';
import { Public } from './modules/auth/decorators/public.decorator';

@Controller()
export class HealthController {
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
        documentation: isSwaggerAllowed
          ? '/api/docs'
          : 'Access Denied (Disabled in production)',
      },
    };
  }

  @Public()
  @Get('health')
  check() {
    return {
      status: 'ok',
      environment: process.env.NODE_ENV || 'development',
      version: process.env.APP_VERSION || '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
