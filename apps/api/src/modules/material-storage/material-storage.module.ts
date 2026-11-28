import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MaterialStorageService } from './material-storage.service';
import { MaterialPreviewService } from './material-preview.service';

@Module({
  imports: [ConfigModule],
  providers: [MaterialStorageService, MaterialPreviewService],
  exports: [MaterialStorageService, MaterialPreviewService],
})
export class MaterialStorageModule {}
