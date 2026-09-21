import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppLoggerModule } from '../../core/logger/logger.module';
import { RateLimiterService } from './rate-limit.service';

@Global()
@Module({
  imports: [ConfigModule, AppLoggerModule],
  providers: [RateLimiterService],
  exports: [RateLimiterService],
})
export class RateLimiterModule {}
