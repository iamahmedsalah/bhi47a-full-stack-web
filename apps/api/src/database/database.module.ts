import * as dns from 'node:dns';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { AppLoggerModule } from '../core/logger/logger.module';
import { AppLoggerService } from '../core/logger/logger.service';
import { ConnectionHolder } from '../common/rate-limit/connection-holder';

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
      inject: [ConfigService, AppLoggerService],
      useFactory: (configService: ConfigService, logger: AppLoggerService) => {
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

        return {
          uri,
          serverSelectionTimeoutMS: 15000,
          socketTimeoutMS: 45000,
          lookup: customLookup,
          connectionFactory: (connection: mongoose.Connection) => {
            ConnectionHolder.connection = connection;
            connection.on('connected', () => {
              logger.log(
                'Database connection established successfully',
                'DatabaseModule',
              );
            });
            connection.on('error', (err) => {
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
