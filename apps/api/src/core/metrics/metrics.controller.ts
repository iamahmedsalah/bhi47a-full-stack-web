import {
  Controller,
  Get,
  Post,
  Param,
  Res,
  Req,
  NotFoundException,
  UnauthorizedException,
  Query,
  BadRequestException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { OptionalAuth } from '../../modules/auth/decorators/public.decorator';
import { Roles } from '../../modules/auth/decorators/roles.decorator';
import { MetricsService } from './metrics.service';
import { UsersService } from '../../modules/users/users.service';
import type { AuthenticatedRequest } from '../../modules/auth/types/authenticated-request';
import { TRAFFIC_WINDOWS, type TrafficWindow } from './http-traffic-window';

@Controller()
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Raw Prometheus exposition endpoint for scrapers or Admins.
   * Access policy: Strictly restricted to Admin users or authorized scrapers with METRICS_SCRAPE_SECRET.
   * `@OptionalAuth()` parses the JWT cookie when present (so `req.user` is set for admins)
   * without rejecting scraper requests that carry only the scrape secret.
   */
  @OptionalAuth()
  @Get('metrics')
  async getMetrics(@Req() req: Request, @Res() res: Response): Promise<void> {
    const isProduction = process.env.NODE_ENV === 'production';
    const secret = process.env.METRICS_SCRAPE_SECRET;

    // Check if scraper secret header is valid
    let hasValidSecret = false;
    if (secret) {
      const authHeader = req.headers.authorization || '';
      const customSecretHeader = req.headers['x-metrics-secret'];
      const bearerMatch = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : '';
      hasValidSecret = customSecretHeader === secret || bearerMatch === secret;
    }

    // Check if user is an authenticated Admin
    const user = (req as AuthenticatedRequest).user;
    const isAdmin = user && user.role === 'admin';

    if (!hasValidSecret && !isAdmin) {
      if (isProduction) {
        throw new NotFoundException('Cannot GET /api/metrics');
      }
      throw new UnauthorizedException(
        'Access denied: Metrics are restricted to administrators',
      );
    }

    const metrics = await this.metricsService.getMetrics();
    res.setHeader('Content-Type', this.metricsService.getContentType());
    res.send(metrics);
  }

  /**
   * JSON Summary endpoint for Admin Portal Dashboard (Server & DB Real-time Monitor).
   * Strictly protected by JwtAuthGuard and restricted to Admins only (@Roles('admin')).
   * Aliases supported:
   *   - GET /api/metrics/summary
   *   - GET /api/admin/metrics
   */
  @Roles('admin')
  @Get(['metrics/summary', 'admin/metrics'])
  async getSummary(@Query('window') window = '5m') {
    if (!Object.hasOwn(TRAFFIC_WINDOWS, window))
      throw new BadRequestException('Unsupported metrics window');
    const summary = await this.metricsService.getSummary(
      window as TrafficWindow,
    );
    const currentlyLockedAccounts =
      await this.usersService.countLockedAccounts();
    return {
      ...summary,
      security: {
        ...summary.security,
        currentlyLockedAccounts,
      },
    };
  }

  /**
   * Get all currently locked accounts due to brute force protection
   */
  @Roles('admin')
  @Get('admin/metrics/locked-accounts')
  async getLockedAccounts() {
    return this.usersService.findLockedAccounts();
  }

  /**
   * Instantly unlock a specific locked account
   */
  @Roles('admin')
  @Post('admin/metrics/unlock-account/:id')
  async unlockAccount(@Param('id') id: string) {
    return this.usersService.unlockAccount(id);
  }

  /**
   * Bulk unlock all locked accounts instantly
   */
  @Roles('admin')
  @Post('admin/metrics/unlock-all-accounts')
  async unlockAllAccounts() {
    return this.usersService.unlockAllAccounts();
  }
}
