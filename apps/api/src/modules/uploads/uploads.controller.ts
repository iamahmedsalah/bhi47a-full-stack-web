import {
  Controller,
  Post,
  Get,
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

  @Get('wipe-summary')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.UPLOADS_IMPORT)
  @ApiOperation({ summary: 'Get counts of students and academic records for data reset (Admin)' })
  getWipeSummary() {
    return this.uploadsService.getWipeSummary();
  }

  @Post('wipe')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.UPLOADS_IMPORT)
  @ApiOperation({ summary: 'Wipe/Reset student and academic data before uploading fresh datasets (Admin)' })
  wipeData(
    @Body('target') target: 'students' | 'grades' | 'attendance' | 'all',
    @CurrentUser('_id') adminId: string,
  ) {
    if (!['students', 'grades', 'attendance', 'all'].includes(target)) {
      throw new BadRequestException('Invalid wipe target');
    }
    return this.uploadsService.wipeData(target, adminId);
  }

  @Post()
  @Roles('admin', 'staff')
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
  @ApiOperation({
    summary: 'Upload and import Excel or CSV data file (Admin/Staff)',
  })
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
