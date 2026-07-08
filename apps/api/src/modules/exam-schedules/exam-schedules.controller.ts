import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExamSchedulesService } from './exam-schedules.service';
import {
  CreateExamScheduleDto,
  UpdateExamScheduleDto,
  QueryExamScheduleDto,
} from './dto/exam-schedule.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { PERMISSIONS } from '@student-portal/shared';
import type { ExamScheduleUploadFile } from './exam-schedules.service';

const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  ...ALLOWED_IMAGE_MIME_TYPES,
  'application/pdf',
]);

@ApiTags('Exam Schedules')
@Controller()
export class ExamSchedulesController {
  constructor(private readonly schedulesService: ExamSchedulesService) {}

  // ─── Student Endpoints ───────────────────────────────────────────

  @Get('students/me/exam-assignment')
  @Roles('student')
  @ApiOperation({
    summary:
      'Get current student exam committee, seat number, and schedules list',
  })
  async getMyAssignment(@CurrentUser('_id') studentId: string) {
    return this.schedulesService.getStudentExamAssignment(studentId);
  }

  // ─── Admin Endpoints ─────────────────────────────────────────────

  @Get('admin/exam-schedules')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.EXAM_SCHEDULES_READ)
  @ApiOperation({ summary: 'List all exam schedules (Admin/Staff)' })
  async findAll(@Query() query: QueryExamScheduleDto) {
    return this.schedulesService.findAll(query);
  }

  @Post('admin/exam-schedules')
  @Roles('admin')
  @ApiOperation({ summary: 'Create new exam schedule upload (Admin)' })
  async create(@Body() dto: CreateExamScheduleDto) {
    return this.schedulesService.create(dto);
  }

  @Post('admin/exam-schedules/upload-image')
  @Roles('admin')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE_BYTES, files: 1 },
      fileFilter: (_req, file, callback) => {
        const hasSupportedExtension = /\.(png|jpe?g|webp|pdf)$/i.test(
          file.originalname || '',
        );
        if (
          !hasSupportedExtension ||
          !ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)
        ) {
          callback(
            new BadRequestException(
              'Only PNG, JPG, WEBP, or PDF files are allowed',
            ),
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
    summary: 'Upload an exam schedule image or PDF to Cloudinary (Admin)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  async uploadImage(@UploadedFile() file: ExamScheduleUploadFile) {
    if (!file) {
      throw new BadRequestException('Please select an image to upload');
    }

    return this.schedulesService.uploadImage(file);
  }

  @Patch('admin/exam-schedules/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update exam schedule status or link (Admin)' })
  async update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateExamScheduleDto,
  ) {
    return this.schedulesService.update(id, dto);
  }

  @Delete('admin/exam-schedules/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete specific exam schedule (Admin)' })
  async remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.schedulesService.remove(id);
  }
}
