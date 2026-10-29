import {
  Controller,
  Get,
  HttpException,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CORS_EXPOSED_HEADERS } from './cors-origins';

@Controller()
class FixtureController {
  @Get('limited')
  limited() {
    throw new HttpException('Limited', 429);
  }
}
describe('browser response metadata', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [FixtureController],
    }).compile();
    app = module.createNestApplication();
    app.enableCors({
      origin: 'https://portal.example.invalid',
      credentials: true,
      exposedHeaders: CORS_EXPOSED_HEADERS,
    });
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it('exposes backoff/correlation headers for credentialed requests without exposing cookies', async () => {
    const response = await request(app.getHttpServer())
      .get('/limited')
      .set('Origin', 'https://portal.example.invalid')
      .expect(429);
    expect(response.headers['access-control-allow-origin']).toBe(
      'https://portal.example.invalid',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-expose-headers']).toBe(
      'Retry-After,X-Correlation-Id',
    );
  });
});
