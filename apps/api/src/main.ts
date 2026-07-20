import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { rateLimitMiddleware } from './common/middleware/rate-limit.middleware';
import { securityHeadersMiddleware } from './common/middleware/security-headers.middleware';
import { AppLoggerService } from './core/logger/logger.service';
import { isOriginAllowed, parseAllowedOrigins } from './config/cors-origins';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  const configService = app.get(ConfigService);
  const logger = app.get(AppLoggerService);
  const port = Number(
    configService.get<string>('PORT') ??
      configService.get<string>('API_PORT') ??
      4000,
  );
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  const allowedOrigins = parseAllowedOrigins(
    configService.get<string>('CLIENT_URL', 'http://localhost:3000'),
  );

  app.useLogger(logger);
  app.setGlobalPrefix('api');

  app.enableCors({
    origin(
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) {
      if (!origin || isOriginAllowed(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true,
  });

  app.use(securityHeadersMiddleware);
  app.use(cookieParser());
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ limit: '10mb', extended: true }));
  app.use(rateLimitMiddleware);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter(logger));
  app.useGlobalInterceptors(new TransformInterceptor());

  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Student Portal API')
      .setDescription('Student Portal API Documentation')
      .setVersion('1.0')
      .addCookieAuth('access_token')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    logger.log(
      `Swagger docs at http://localhost:${port}/api/docs`,
      'Bootstrap',
    );
  }

  await app.listen(port);
  logger.log(`API running on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
