import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { PERMISSIONS } from '@student-portal/shared';
import { StudentsService } from '../students.service';
import {
  UpdateTuitionStatusDto,
  BulkToggleTuitionDto,
  QueryTuitionStatusDto,
  BatchTuitionUploadDto,
} from '../dto/tuition-status.dto';

@ApiTags('Students Tuition & Block Management')
@Controller('admin/students/tuition')
export class StudentsTuitionController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get('stats')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.TUITION_READ)
  @ApiOperation({
    summary: 'Get summary statistics of tuition fees and block status',
  })
  async getStats() {
    return this.studentsService.getTuitionStats();
  }

  @Get('list')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.TUITION_READ)
  @ApiOperation({
    summary:
      'List students with tuition fee status and blocked flags with filtering',
  })
  async getTuitionList(@Query() query: QueryTuitionStatusDto) {
    return this.studentsService.getTuitionList(query);
  }

  @Get('template')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.TUITION_READ)
  @ApiOperation({
    summary:
      'Download official Excel (.xlsx) or CSV template for tuition fees and blocking',
  })
  async downloadTemplate(
    @Query('format') format: 'xlsx' | 'csv' = 'xlsx',
    @Res() res: Response,
  ) {
    const selectedFormat = format === 'csv' ? 'csv' : 'xlsx';
    const result =
      await this.studentsService.generateTuitionTemplate(selectedFormat);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
    );
    res.send(result.buffer);
  }

  @Patch(':id/status')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.TUITION_WRITE)
  @ApiOperation({
    summary:
      'Update single student tuition payment and portal block status (Admin/Staff)',
  })
  async updateStatus(
    @Param('id') studentId: string,
    @Body() dto: UpdateTuitionStatusDto,
  ) {
    return this.studentsService.updateStudentTuitionStatus(studentId, dto);
  }

  @Post('bulk-toggle')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.TUITION_WRITE)
  @ApiOperation({
    summary:
      'Bulk toggle block status and tuition fees for selected students (Admin/Staff)',
  })
  async bulkToggle(@Body() dto: BulkToggleTuitionDto) {
    return this.studentsService.bulkToggleTuitionStatus(dto);
  }

  @Post('upload-excel')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.TUITION_WRITE)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload and import student tuition and block status from Excel (.xlsx) or CSV',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async uploadExcel(
    @UploadedFile() file?: { buffer: Buffer; originalname: string },
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('يرجى تحديد ملف Excel أو CSV لرفعه');
    }
    return this.studentsService.bulkUpdateTuitionFromExcel(
      file.buffer,
      file.originalname,
    );
  }

  @Get('export')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.TUITION_READ)
  @ApiOperation({
    summary:
      'Export filtered student tuition and block status records to styled Excel (.xlsx)',
  })
  async exportTuition(
    @Query() query: QueryTuitionStatusDto,
    @Res() res: Response,
  ) {
    const result = await this.studentsService.exportTuitionToExcel(query);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
    );
    res.send(result.buffer);
  }

  @Post('batch')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.TUITION_WRITE)
  @ApiOperation({
    summary:
      'Process a batch of parsed tuition/block rows with real-time feedback',
  })
  async processBatch(@Body() dto: BatchTuitionUploadDto) {
    return this.studentsService.processBatchTuitionRows(dto.rows);
  }
}
