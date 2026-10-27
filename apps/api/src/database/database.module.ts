import * as dns from 'node:dns';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { AppLoggerModule } from '../core/logger/logger.module';
import { AppLoggerService } from '../core/logger/logger.service';
import { ConnectionHolder } from '../common/rate-limit/connection-holder';

import { createMongooseMetricsPlugin } from './mongoose-metrics.plugin';
import { MetricsService } from '../core/metrics/metrics.service';
import { isServerlessRuntime } from '../common/utils/runtime.util';

type ParsedDatabaseError = Error & {
  code?: string;
  customMessage?: string;
};

const parseDatabaseError = (error: unknown): ParsedDatabaseError => {
  const parsed = error as ParsedDatabaseError;
  const lower = String(parsed?.message || '').toLowerCase();

  parsed.code = 'DB_UNAVAILABLE';
  parsed.customMessage = 'Database is unavailable. Please try again.';

  if (
    lower.includes('querysrv') ||
    lower.includes('enotfound') ||
    lower.includes('econnrefused')
  ) {
    parsed.code = 'DB_DNS_RESOLUTION_FAILED';
    parsed.customMessage =
      'Database hostname resolution failed. Check your DNS settings or whitelist.';
  } else if (
    lower.includes('server selection timed out') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout')
  ) {
    parsed.code = 'DB_CONNECTION_TIMEOUT';
    parsed.customMessage = 'Database connection timed out.';
  } else if (
    lower.includes('authentication failed') ||
    lower.includes('bad auth')
  ) {
    parsed.code = 'DB_AUTH_FAILED';
    parsed.customMessage =
      'Database authentication failed. Please check MONGODB_URI username and password.';
  } else if (
    lower.includes('not allowed to access this mongodb deployment') ||
    lower.includes('ip address')
  ) {
    parsed.code = 'DB_NETWORK_DENIED';
    parsed.customMessage =
      'Database network access is denied. Whitelist your current IP address.';
  } else if (lower.includes('uri') || lower.includes('connection string')) {
    parsed.code = 'DB_URL_INVALID';
    parsed.customMessage = 'Database connection string is invalid.';
  }

  return parsed;
};

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule, AppLoggerModule],
      inject: [ConfigService, AppLoggerService, MetricsService],
      useFactory: (
        configService: ConfigService,
        logger: AppLoggerService,
        metricsService: MetricsService,
      ) => {
        const dnsServers = String(configService.get<string>('DNS_SERVERS', ''))
          .split(',')
          .map((server) => server.trim())
          .filter(Boolean);

        if (dnsServers.length > 0) {
          try {
            dns.setServers(dnsServers);
            logger.log(
              `Custom DNS servers applied: ${dnsServers.join(', ')}`,
              'DatabaseModule',
            );
          } catch (error) {
            logger.warn(
              `Failed to apply custom DNS servers; falling back to system DNS: ${(error as Error).message}`,
              'DatabaseModule',
            );
          }
        }

        const resolver = new dns.Resolver();
        if (dnsServers.length > 0) {
          try {
            resolver.setServers(dnsServers);
          } catch (e) {
            logger.warn(
              `Failed to set DNS servers on resolver: ${(e as Error).message}`,
              'DatabaseModule',
            );
          }
        }

        const customLookup = (
          hostname: string,
          options: any,
          callback: (err: Error | null, address: any, family?: number) => void,
        ) => {
          if (dnsServers.length === 0) {
            return dns.lookup(hostname, options, callback);
          }

          resolver.resolve4(hostname, (err, addresses) => {
            if (err) {
              return dns.lookup(hostname, options, callback);
            }

            if (addresses && addresses.length > 0) {
              if (options.all) {
                const results = addresses.map((addr) => ({
                  address: addr,
                  family: 4,
                }));
                return callback(null, results);
              } else {
                return callback(null, addresses[0], 4);
              }
            }

            dns.lookup(hostname, options, callback);
          });
        };

        const uri = configService.get<string>(
          'MONGODB_URI',
          'mongodb://localhost:27017/student-portal',
        );

        logger.log('Attempting database connection...', 'DatabaseModule');

        const serverless = isServerlessRuntime();
        const defaultMinPool = serverless ? '1' : '5';
        const defaultMaxPool = serverless ? '10' : '50';

        let minPoolSize = Number(
          configService.get<string>('MONGODB_MIN_POOL_SIZE', defaultMinPool),
        );
        let maxPoolSize = Number(
          configService.get<string>('MONGODB_MAX_POOL_SIZE', defaultMaxPool),
        );

        if (serverless) {
          // On serverless (Vercel / Lambda), cap minPoolSize to 1 and maxPoolSize to 10
          // to eliminate 5x concurrent TLS handshakes during cold-start boots.
          minPoolSize = Math.min(
            Number.isFinite(minPoolSize) ? minPoolSize : 1,
            1,
          );
          maxPoolSize = Math.min(
            Number.isFinite(maxPoolSize) ? maxPoolSize : 10,
            10,
          );
        }

        return {
          uri,
          serverSelectionTimeoutMS: serverless ? 8000 : 15000,
          socketTimeoutMS: 45000,
          // Keep warm connections in persistent servers to avoid TLS handshakes per query burst.
          // In serverless (Vercel), default to min=1 / max=10 to avoid connection exhaustion across lambda instances.
          minPoolSize: Number.isFinite(minPoolSize)
            ? minPoolSize
            : Number(defaultMinPool),
          maxPoolSize: Number.isFinite(maxPoolSize)
            ? maxPoolSize
            : Number(defaultMaxPool),
          maxIdleTimeMS: 300000,
          lookup: customLookup,
          connectionFactory: (connection: mongoose.Connection) => {
            ConnectionHolder.connection = connection;
            // Nest may invoke the factory after the first connected event.
            metricsService.setDbConnected(Number(connection.readyState) === 1);

            const slowThreshold = Number(
              configService.get<string>('SLOW_QUERY_THRESHOLD_MS'),
            );
            connection.plugin(
              createMongooseMetricsPlugin(
                metricsService,
                logger,
                Number.isFinite(slowThreshold) && slowThreshold > 0
                  ? slowThreshold
                  : undefined,
              ),
            );

            connection.on('connected', () => {
              metricsService.setDbConnected(true);
              logger.log(
                'Database connection established successfully',
                'DatabaseModule',
              );
            });
            connection.on('disconnected', () => {
              metricsService.setDbConnected(false);
              logger.warn('Database connection disconnected', 'DatabaseModule');
            });
            connection.on('error', (err) => {
              metricsService.setDbConnected(
                Number(connection.readyState) === 1,
              );
              const parsedError = parseDatabaseError(err);
              logger.error(
                parsedError.customMessage || parsedError.message,
                parsedError.stack,
                'DatabaseModule',
              );
            });
            return connection;
          },
        };
      },
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
