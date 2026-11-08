import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MaterialStorageService } from './material-storage.service';

@Module({
  imports: [ConfigModule],
  providers: [MaterialStorageService],
  exports: [MaterialStorageService],
})
export class MaterialStorageModule {}
