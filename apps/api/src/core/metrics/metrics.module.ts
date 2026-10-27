import { Module, Global } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { UsersModule } from '../../modules/users/users.module';

@Global()
@Module({
  imports: [UsersModule],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
