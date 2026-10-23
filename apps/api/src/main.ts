import fs from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { json, urlencoded, type Request, type Response } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { createRateLimitMiddleware } from './common/middleware/rate-limit.middleware';
import { RateLimiterService } from './common/rate-limit/rate-limit.service';
import { securityHeadersMiddleware } from './common/middleware/security-headers.middleware';
import { AppLoggerService } from './core/logger/logger.service';
import {
  CORS_BLOCKED_ERROR_PREFIX,
  isOriginAllowed,
  parseAllowedOrigins,
} from './config/cors-origins';
import { NotificationsService } from './modules/notifications/notifications.service';
import { QueueService } from './core/queues/queue.service';
import { MetricsService } from './core/metrics/metrics.service';
import { createHttpMetricsMiddleware } from './core/metrics/http-metrics.middleware';
import mongoose from 'mongoose';
import { ConnectionHolder } from './common/rate-limit/connection-holder';

function resolveAppVersion(): string {
  if (process.env.APP_VERSION) {
    return process.env.APP_VERSION;
  }
  const candidates = [
    path.resolve(__dirname, '../package.json'),
    path.resolve(__dirname, '../../package.json'),
    path.resolve(process.cwd(), 'package.json'),
    path.resolve(process.cwd(), 'apps/api/package.json'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const raw = fs.readFileSync(candidate, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.version) return parsed.version;
      }
    } catch {
      // Continue searching next candidate
    }
  }
  return '1.0.0';
}

function printStartupBanner(params: {
  env: string;
  version: string;
  port: number;
  isProduction: boolean;
  swaggerUrl?: string;
  firebaseStatus: { ready: boolean; message: string };
  redisStatus: { ready: boolean; message: string };
}) {
  const line = '═'.repeat(58);
  const subLine = '─'.repeat(58);
  const envTag = params.env.toUpperCase();

  console.log('\n' + line);
  console.log('         🎓  STUDENT PORTAL BACKEND API');
  console.log(subLine);
  console.log(`   ⚡ Environment  : [ ${envTag} ]`);
  console.log(`   📦 Version      : v${params.version}`);
  console.log(`   🚀 API URL      : http://localhost:${params.port}/api`);
  if (params.swaggerUrl) {
    console.log(`   📖 Swagger API  : ${params.swaggerUrl}`);
  } else {
    console.log(`   🔒 Swagger API  : Disabled (Access Denied in ${envTag})`);
  }
  console.log(`   🟢 Node.js      : ${process.version}`);
  console.log(subLine);
  const fbTag = params.firebaseStatus.ready ? 'ONLINE' : 'FALLBACK';
  const redisTag = params.redisStatus.ready ? 'CONNECTED' : 'INLINE';
  console.log(
    `   🔥 Firebase SDK : [ ${fbTag} ] ${params.firebaseStatus.message}`,
  );
  console.log(
    `   🔴 Redis Queue  : [ ${redisTag} ] ${params.redisStatus.message}`,
  );
  console.log(line + '\n');
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  const configService = app.get(ConfigService);
  const logger = app.get(AppLoggerService);
  const rateLimiterService = app.get(RateLimiterService);
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
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  app.use(createHttpMetricsMiddleware(app.get(MetricsService)));

  app.enableCors({
    origin(
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) {
      if (!origin || isOriginAllowed(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error(`${CORS_BLOCKED_ERROR_PREFIX}: ${origin}`));
    },
    credentials: true,
  });

  app.use(compression());
  app.use(securityHeadersMiddleware);
  app.use(cookieParser());
  app.use(json({ limit: '4mb' }));
  app.use(urlencoded({ limit: '4mb', extended: true }));
  app.use(createRateLimitMiddleware(rateLimiterService));

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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Student Portal API')
    .setDescription('Student Portal API Documentation')
    .setVersion('1.0')
    .addCookieAuth('access_token')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // Register all endpoints from the API catalog into MetricsService
  try {
    const metricsService = app.get(MetricsService);
    const catalogRoutes: Array<{ method: string; path: string }> = [];
    const validMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
    for (const [rawPath, pathItem] of Object.entries(document.paths || {})) {
      if (!pathItem || typeof pathItem !== 'object') continue;
      const cleanPath = rawPath.replace(/\{([^}]+)\}/g, ':$1');
      for (const methodKey of Object.keys(pathItem)) {
        const upperMethod = methodKey.toUpperCase();
        if (validMethods.has(upperMethod)) {
          catalogRoutes.push({ method: upperMethod, path: cleanPath });
        }
      }
    }
    metricsService.registerCatalogRoutes(catalogRoutes);
  } catch {
    // Non-fatal if route scanning fails
  }

  const isSwaggerAllowed =
    !isProduction || configService.get<string>('ENABLE_SWAGGER') === 'true';

  if (isSwaggerAllowed) {
    SwaggerModule.setup('api/docs', app, document);
    logger.log(
      `Swagger docs available at http://localhost:${port}/api/docs`,
      'Bootstrap',
    );
  } else {
    // In production or when Swagger is disabled, explicitly deny access with 403 Forbidden
    app.use(['/api/docs', '/docs'], (req: Request, res: Response) => {
      const acceptsHtml = req.headers.accept?.includes('text/html');
      if (acceptsHtml) {
        res.status(403).setHeader('Content-Type', 'text/html').send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>403 Forbidden - Access Denied</title>
  <style>
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0f172a; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 2.5rem; max-width: 480px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { color: #f43f5e; font-size: 1.5rem; margin: 0 0 0.75rem 0; }
    p { color: #94a3b8; font-size: 0.95rem; line-height: 1.6; margin: 0 0 1.5rem 0; }
    .tag { display: inline-block; background: #334155; color: #38bdf8; padding: 0.35rem 0.85rem; border-radius: 9999px; font-size: 0.8rem; font-weight: 500; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔒</div>
    <h1>403 Forbidden - Access Denied</h1>
    <p>Swagger API documentation is restricted and disabled in the <strong>production</strong> environment.</p>
    <div class="tag">Environment: PRODUCTION</div>
  </div>
</body>
</html>
            `);
      } else {
        res.status(403).json({
          statusCode: 403,
          error: 'Forbidden',
          message:
            'Access Denied: Swagger API documentation is disabled in production mode.',
          environment: 'production',
        });
      }
    });
    logger.log(
      'Swagger docs disabled (Access Denied / 403) in production mode',
      'Bootstrap',
    );
  }

  const version = resolveAppVersion();
  const swaggerUrl = isSwaggerAllowed
    ? `http://localhost:${port}/api/docs`
    : undefined;

  let firebaseStatus = {
    ready: false,
    message: 'Notifications service not loaded',
  };
  try {
    const notificationsService = app.get(NotificationsService, {
      strict: false,
    });
    if (notificationsService) {
      firebaseStatus = notificationsService.getFirebaseStatus();
    }
  } catch {
    // Continue with default
  }

  let redisStatus = {
    ready: false,
    message: 'Queue service not loaded',
  };
  try {
    const queueService = app.get(QueueService, { strict: false });
    if (queueService) {
      redisStatus = await queueService.checkConnection();
    }
  } catch {
    // Continue with default
  }

  // Pre-warm database connection pool to eliminate initial request cold-start latency
  try {
    const conn = ConnectionHolder.connection || mongoose.connection;
    if (conn) {
      if (conn.readyState !== mongoose.ConnectionStates.connected) {
        await conn.asPromise();
      }
      if (conn.db) {
        await conn.db.admin().ping();
        logger.log(
          'Database connection pool pre-warmed successfully',
          'Bootstrap',
        );
      }
    }
  } catch (err) {
    logger.warn(
      `Database warm-up ping skipped: ${(err as Error).message}`,
      'Bootstrap',
    );
  }

  await app.listen(port);

  printStartupBanner({
    env: isProduction ? 'production' : 'development',
    version,
    port,
    isProduction,
    swaggerUrl,
    firebaseStatus,
    redisStatus,
  });

  logger.log(
    `API running in ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} mode (v${version}) on http://localhost:${port}`,
    'Bootstrap',
  );
}

void bootstrap();
