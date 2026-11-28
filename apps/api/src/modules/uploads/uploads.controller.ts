import {
  Controller,
  Post,
  Get,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
  ForbiddenException,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { UploadsService } from './uploads.service';
import { UploadsTemplateGenerator } from './uploads-template.generator';
import { BatchUploadDto } from './dto/upload.dto';
import { WipeDataDto, WipePreviewDto } from './dto/wipe-data.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '@student-portal/shared';
import { MAX_HTTP_UPLOAD_SIZE_BYTES } from '../../common/constants/platform-limits';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import { isTeachingStaff } from '../courses/utils/course-staff.util';

const MAX_UPLOAD_SIZE_BYTES = MAX_HTTP_UPLOAD_SIZE_BYTES;
const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
  'application/excel',
  'application/x-excel',
  'application/x-msexcel',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
  'text/csv',
  'text/comma-separated-values',
  'application/csv',
  'application/x-csv',
  'text/plain',
  'text/xml',
  'application/xml',
  '',
]);

@ApiTags('Uploads')
@Controller('admin/uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Get('templates/bundle')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.UPLOADS_IMPORT)
  @ApiOperation({
    summary: 'Download zip bundle containing all Excel templates',
  })
  async downloadTemplatesBundle(
    @Query('lang') lang: 'ar' | 'en' = 'ar',
    @Res() res: Response,
  ) {
    const { buffer, filename } =
      await UploadsTemplateGenerator.generateZipBundle(lang);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(buffer);
  }

  @Get('templates/:type')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.UPLOADS_IMPORT)
  @ApiOperation({
    summary: 'Download official Excel (.xlsx) template for specific type',
  })
  async downloadTemplate(
    @Param('type') type: string,
    @Query('lang') lang: 'ar' | 'en' = 'ar',
    @Res() res: Response,
  ) {
    try {
      const { buffer, filename } = await UploadsTemplateGenerator.generate(
        type,
        lang,
      );
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      res.send(buffer);
    } catch (err: any) {
      throw new BadRequestException(
        err?.message || 'Failed to generate template',
      );
    }
  }

  @Get('wipe-summary')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.UPLOADS_IMPORT)
  @ApiOperation({
    summary:
      'Get accurate counts across legacy & separated collections plus available academic years/levels (Admin)',
  })
  getWipeSummary() {
    return this.uploadsService.getWipeSummary();
  }

  @Post('wipe-preview')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.UPLOADS_IMPORT)
  @ApiOperation({
    summary:
      'Dry-run preview of records that will be wiped and protected Control records under the selected filters (Admin)',
  })
  previewWipe(@Body() dto: WipePreviewDto) {
    return this.uploadsService.previewWipe(dto);
  }

  @Post('wipe')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.UPLOADS_IMPORT)
  @ApiOperation({
    summary:
      'Wipe/Reset student and academic data with granular year/semester/exam-type filters and Control protection (Admin)',
  })
  wipeData(@Body() dto: WipeDataDto, @CurrentUser('_id') adminId: string) {
    return this.uploadsService.wipeData(dto, adminId);
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
        const mime = (file.mimetype || '').toLowerCase();
        const isAllowedMime =
          ALLOWED_MIME_TYPES.has(mime) ||
          mime.includes('spreadsheet') ||
          mime.includes('excel') ||
          mime.includes('csv');
        if (!hasSupportedExtension || !isAllowedMime) {
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
            'academic-warnings',
          ],
        },
      },
      required: ['file', 'type'],
    },
  })
  async uploadFile(
    @UploadedFile() file: any,
    @Body('type') type: string,
    @CurrentUser() actor: AuthenticatedUser,
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
    this.assertGradeImport(type, actor);
    return this.uploadsService.processUpload(
      file.buffer,
      type,
      actor._id,
      file.originalname,
    );
  }

  @Post('historical-grades/batch')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.UPLOADS_IMPORT)
  async uploadHistoricalBatch(
    @Body() dto: BatchUploadDto,
    @CurrentUser('_id') adminId: string,
  ) {
    return this.uploadsService.processBatchUpload(dto, adminId, true);
  }

  @Post('batch')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.UPLOADS_IMPORT)
  @ApiOperation({
    summary:
      'Resilient chunk/batch data upload for incremental processing with auto-retry and resume support',
  })
  async uploadBatch(
    @Body() dto: BatchUploadDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    this.assertGradeImport(dto.type, actor);
    return this.uploadsService.processBatchUpload(dto, actor._id);
  }

  private assertGradeImport(type: string, actor: AuthenticatedUser) {
    if (
      type === 'grades' &&
      actor.role === 'staff' &&
      isTeachingStaff(actor.staffType)
    ) {
      throw new ForbiddenException(
        'Use the Control workbook to import course grades',
      );
    }
  }
}
