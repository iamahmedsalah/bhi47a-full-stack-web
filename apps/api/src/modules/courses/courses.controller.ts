import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import {
  CoursesService,
  type CourseSyllabusFile,
  type StudentSyllabiResponse,
} from './courses.service';
import {
  CreateCourseDto,
  UpdateCourseDto,
  QueryCourseDto,
  EnrollStudentsBatchDto,
  EnrollmentOptionsDto,
} from './dto/course.dto';
import {
  CreateCourseMaterialDto,
  QueryCourseMaterialsDto,
} from './dto/course-material.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { PERMISSIONS } from '@student-portal/shared';
import { MAX_HTTP_UPLOAD_SIZE_BYTES } from '../../common/constants/platform-limits';

@ApiTags('Courses')
@Controller()
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  // ─── Student/Public Routes ────────────────────────────────────────

  @Get('courses')
  @Roles('student', 'admin', 'staff')
  @ApiOperation({ summary: 'List active courses' })
  async findActive(
    @Query() query: QueryCourseDto,
    @CurrentUser() user: { _id: string; role: string },
  ) {
    if (user.role === 'student')
      return this.coursesService.findStudentCourses(query, user._id.toString());
    return this.coursesService.findAll({ ...query, isActive: true });
  }

  @Get('students/me/syllabi')
  @Roles('student')
  @ApiOperation({
    summary:
      'Get registered and level courses curriculum/syllabus PDFs for current student',
  })
  async getMySyllabi(
    @CurrentUser('_id') studentUserId: string,
  ): Promise<StudentSyllabiResponse> {
    return this.coursesService.getStudentSyllabi(studentUserId);
  }

  @Get('courses/:id/syllabus/download')
  @Roles('student', 'admin', 'staff')
  @ApiOperation({ summary: 'Secure stream / download course syllabus PDF' })
  async downloadSyllabus(
    @Param('id', ParseObjectIdPipe) id: string,
    @Res() res: any,
    @CurrentUser() user: any,
  ) {
    return this.coursesService.downloadSyllabus(id, res, user);
  }

  @Get(['staff/me/assigned-courses', 'courses/staff/me/assigned-courses'])
  @Roles('admin', 'staff')
  @ApiOperation({
    summary: 'Get courses assigned to current doctor/staff member',
  })
  async getMyAssignedCourses(@CurrentUser('_id') staffUserId: string) {
    return this.coursesService.findDoctorCourses(staffUserId);
  }

  // ─── Admin/Staff Routes ───────────────────────────────────────────

  @Get('admin/courses')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSES_READ)
  @ApiOperation({ summary: 'List all courses with filters (Admin/Staff)' })
  async findAll(@Query() query: QueryCourseDto, @CurrentUser() user: any) {
    return this.coursesService.findAll(query, user);
  }

  @Get('admin/courses/enrollment-template')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSES_READ)
  @ApiOperation({
    summary:
      'Download standard Excel or CSV template for bulk student course enrollment',
  })
  async downloadEnrollmentTemplate(
    @Query('format') format: 'xlsx' | 'csv' = 'xlsx',
    @Res() res: Response,
  ) {
    const selectedFormat = format === 'csv' ? 'csv' : 'xlsx';
    const result =
      await this.coursesService.generateEnrollmentTemplate(selectedFormat);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
    );
    res.send(result.buffer);
  }

  @Get('admin/courses/export')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSES_READ)
  async exportCourses(
    @Query() query: QueryCourseDto,
    @CurrentUser() caller: { _id: string; role: string },
    @Res() res: Response,
  ) {
    const buffer = await this.coursesService.exportCourses(query, caller);
    const filename = 'courses_export.xlsx';
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  }

  @Post('admin/courses/:id/enroll-students-excel')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSES_WRITE)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Bulk enroll students in this course from Excel (.xlsx) or CSV',
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
  async enrollStudentsFromExcel(
    @Param('id', ParseObjectIdPipe) id: string,
    @UploadedFile() file: CourseSyllabusFile,
    @Query() options: EnrollmentOptionsDto,
    @CurrentUser() caller: { _id: string; role: string },
  ) {
    if (!file) {
      throw new BadRequestException(
        'Please select an Excel or CSV file to upload',
      );
    }
    return this.coursesService.enrollStudentsFromExcel(
      id,
      file.buffer,
      file.originalname,
      {
        ...options,
        actor: { _id: String(caller._id), role: caller.role },
      },
    );
  }

  @Post('admin/courses/:id/enroll-students-batch')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSES_WRITE)
  @ApiOperation({
    summary: 'Bulk enroll students in this course from JSON batch rows',
  })
  async enrollStudentsBatch(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: EnrollStudentsBatchDto,
    @CurrentUser() caller: { _id: string; role: string },
  ) {
    if (!dto.rows || !Array.isArray(dto.rows) || dto.rows.length === 0) {
      throw new BadRequestException(
        'rows array is required and must not be empty',
      );
    }
    return this.coursesService.enrollStudentsBatch(id, dto.rows, {
      academicYear: dto.academicYear,
      semester: dto.semester,
      skipBlocked: dto.skipBlocked,
      overrideRegistrationLimits: dto.overrideRegistrationLimits,
      overrideReason: dto.overrideReason,
      actor: { _id: String(caller._id), role: caller.role },
    });
  }

  @Get('admin/courses/:id/enrollments/count')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSES_READ)
  @ApiOperation({
    summary:
      'Get enrolled students count for a course in a given academic term',
  })
  async getCourseEnrollmentsCount(
    @Param('id', ParseObjectIdPipe) id: string,
    @Query('academicYear') academicYear?: string,
    @Query('semester') semester?: string,
  ) {
    return this.coursesService.getCourseEnrollmentsCount(id, {
      academicYear,
      semester,
    });
  }

  @Delete('admin/courses/:id/enrollments')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSES_WRITE)
  @ApiOperation({
    summary:
      'Reset and remove all student enrollments for a specific course (e.g. uploaded wrong data)',
  })
  async resetCourseEnrollments(
    @Param('id', ParseObjectIdPipe) id: string,
    @Query('academicYear') academicYear?: string,
    @Query('semester') semester?: string,
  ) {
    return this.coursesService.resetCourseEnrollments(id, {
      academicYear,
      semester,
    });
  }

  @Post('admin/courses')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSES_WRITE)
  @ApiOperation({ summary: 'Create new course (Admin)' })
  async create(@Body() dto: CreateCourseDto) {
    return this.coursesService.create(dto);
  }

  @Post('admin/courses/:id/syllabus')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSES_WRITE)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_HTTP_UPLOAD_SIZE_BYTES }, // 4MB max for PDF syllabus (Vercel serverless limit)
      fileFilter: (_req, file, callback) => {
        if (
          file.mimetype === 'application/pdf' ||
          /\.pdf$/i.test(file.originalname)
        ) {
          callback(null, true);
        } else {
          callback(
            new BadRequestException(
              'Only PDF documents are allowed for course syllabus',
            ),
            false,
          );
        }
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload course curriculum / syllabus PDF (Admin/Staff)',
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
  async uploadSyllabus(
    @Param('id', ParseObjectIdPipe) id: string,
    @UploadedFile() file: CourseSyllabusFile,
    @CurrentUser() caller: any,
  ) {
    if (!file) {
      throw new BadRequestException('Please select a PDF file to upload');
    }
    return this.coursesService.uploadSyllabus(id, file, caller);
  }

  @Post('admin/courses/:id/cover-image')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSES_WRITE)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_HTTP_UPLOAD_SIZE_BYTES }, // 4MB max for cover image (Vercel serverless limit)
      fileFilter: (_req, file, callback) => {
        if (
          file.mimetype.startsWith('image/') ||
          /\.(jpg|jpeg|png|webp|avif)$/i.test(file.originalname)
        ) {
          callback(null, true);
        } else {
          callback(
            new BadRequestException(
              'Only image files (JPG, PNG, WebP) are allowed for book cover',
            ),
            false,
          );
        }
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload course cover image / book thumbnail (Admin/Doctor)',
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
  async uploadCoverImage(
    @Param('id', ParseObjectIdPipe) id: string,
    @UploadedFile() file: CourseSyllabusFile,
    @CurrentUser() caller: any,
  ) {
    if (!file) {
      throw new BadRequestException('Please select an image file to upload');
    }
    return this.coursesService.uploadCoverImage(id, file, caller);
  }

  @Patch('admin/courses/:id')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSES_WRITE)
  @ApiOperation({ summary: 'Update course (Admin)' })
  async update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.coursesService.update(id, dto);
  }

  @Delete('admin/courses/:id/syllabus')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSES_WRITE)
  @ApiOperation({ summary: 'Remove course syllabus PDF (Admin/Doctor)' })
  async removeSyllabus(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() caller: any,
  ) {
    return this.coursesService.removeSyllabus(id, caller);
  }

  @Delete('admin/courses/:id/cover-image')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSES_WRITE)
  @ApiOperation({ summary: 'Remove course cover image (Admin/Doctor)' })
  async removeCoverImage(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() caller: any,
  ) {
    return this.coursesService.removeCoverImage(id, caller);
  }

  // ─── Course Materials (Lectures & Sections) Routes ───────────────────

  @Post(['courses/:id/materials', 'admin/courses/:id/materials'])
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSE_MATERIALS_WRITE)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 15 * 1024 * 1024 }, // 15MB max for academic material
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload academic lecture (by Doctor) or section (by TA) for a course',
  })
  async uploadMaterial(
    @Param('id', ParseObjectIdPipe) id: string,
    @UploadedFile() file: CourseSyllabusFile,
    @Body() dto: CreateCourseMaterialDto,
    @CurrentUser() caller: any,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('يرجى اختيار ملف المحاضرة أو السكشن لرفعه');
    }
    return this.coursesService.uploadCourseMaterial(id, file, dto, caller);
  }

  @Get('courses/:id/materials')
  @Roles('admin', 'staff', 'student')
  @ApiOperation({
    summary:
      'List course materials (Lectures & Sections). Blocked students are restricted.',
  })
  async getMaterials(
    @Param('id', ParseObjectIdPipe) id: string,
    @Query() query: QueryCourseMaterialsDto,
    @CurrentUser() caller: any,
  ) {
    return this.coursesService.getCourseMaterials(id, query, caller);
  }

  @Get('courses/materials/:materialId/download')
  @Roles('admin', 'staff', 'student')
  @ApiOperation({
    summary:
      'Stream / download course lecture or section file. Blocked students receive 403 Forbidden.',
  })
  async downloadMaterial(
    @Param('materialId', ParseObjectIdPipe) materialId: string,
    @Res() res: Response,
    @CurrentUser() caller: any,
  ) {
    return this.coursesService.downloadCourseMaterial(materialId, res, caller);
  }

  @Delete([
    'courses/materials/:materialId',
    'admin/courses/materials/:materialId',
  ])
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSE_MATERIALS_DELETE)
  @ApiOperation({
    summary: 'Delete course lecture or section (Admin or original uploader)',
  })
  async deleteMaterial(
    @Param('materialId', ParseObjectIdPipe) materialId: string,
    @CurrentUser() caller: any,
  ) {
    return this.coursesService.deleteCourseMaterial(materialId, caller);
  }

  @Delete('admin/courses/:id')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.COURSES_WRITE)
  @ApiOperation({ summary: 'Delete course (Admin)' })
  async remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.coursesService.remove(id);
  }
}
