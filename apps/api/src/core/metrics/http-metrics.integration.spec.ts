import {
  Controller,
  Get,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Request, Response } from 'express';
import type { MetricsService } from './metrics.service';
import { createHttpMetricsMiddleware } from './http-metrics.middleware';

class RejectGuard {
  canActivate(): boolean {
    throw new UnauthorizedException();
  }
}

@Controller('probe')
class ProbeController {
  @Get('guarded')
  @UseGuards(RejectGuard)
  guarded() {
    return { ok: true };
  }
}

describe('metrics before the Nest request pipeline', () => {
  it('observes guard, router and pre-controller rate-limit rejections', async () => {
    const module = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [RejectGuard],
    }).compile();
    const app = module.createNestApplication({ logger: false });
    const recordHttpRequest = jest.fn();
    app.use(
      createHttpMetricsMiddleware({
        recordHttpRequest,
      } as unknown as MetricsService),
    );
    app.use('/probe/throttled', (_req: Request, res: Response) => {
      res.status(429).json({ message: 'limited' });
    });
    try {
      await app.init();
      for (const [path, status] of [
        ['guarded', 401],
        ['missing', 404],
        ['throttled', 429],
      ] as const) {
        await request(app.getHttpServer())
          .get(`/probe/${path}`)
          .timeout(5000)
          .expect(status);
        expect(recordHttpRequest).toHaveBeenLastCalledWith(
          'GET',
          status === 404 ? '/unmatched' : `/probe/${path}`,
          status,
          expect.any(Number),
        );
      }
      expect(recordHttpRequest).toHaveBeenCalledTimes(3);
    } finally {
      await app.close();
    }
  }, 30_000);
});
