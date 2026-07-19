import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { UploadsService } from './uploads.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '@student-portal/shared';

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
  'text/csv',
  'application/csv',
  'text/plain',
]);

@ApiTags('Uploads')
@Controller('admin/uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.UPLOADS_IMPORT)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE_BYTES, files: 1 },
      fileFilter: (_req, file, callback) => {
        const hasSupportedExtension = /\.(xlsx|xls|csv)$/i.test(
          file.originalname || '',
        );
        if (!hasSupportedExtension || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
          callback(
            new BadRequestException('Only xlsx, xls, or csv files are allowed'),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload and import Excel or CSV data file (Admin)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        type: {
          type: 'string',
          enum: [
            'students',
            'courses',
            'grades',
            'quizzes',
            'attendance',
            'academic-emails',
          ],
        },
      },
      required: ['file', 'type'],
    },
  })
  async uploadFile(
    @UploadedFile() file: any,
    @Body('type') type: string,
    @CurrentUser('_id') adminId: string,
  ) {
    if (!file) {
      throw new BadRequestException('Please select a file to upload');
    }
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      throw new BadRequestException('Uploaded file is too large');
    }
    if (!type) {
      throw new BadRequestException('Please specify file type');
    }
    return this.uploadsService.processUpload(file.buffer, type, adminId);
  }
}
