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
} from './dto/course.dto';
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
  async findActive(@Query() query: QueryCourseDto) {
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
  ) {
    return this.coursesService.downloadSyllabus(id, res);
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
  async findAll(@Query() query: QueryCourseDto) {
    return this.coursesService.findAll(query);
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
  ) {
    if (!file) {
      throw new BadRequestException('Please select a PDF file to upload');
    }
    return this.coursesService.uploadSyllabus(id, file);
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
    summary: 'Upload course cover image / book thumbnail (Admin/Staff)',
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
  ) {
    if (!file) {
      throw new BadRequestException('Please select an image file to upload');
    }
    return this.coursesService.uploadCoverImage(id, file);
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
  @ApiOperation({ summary: 'Remove course syllabus PDF (Admin/Staff)' })
  async removeSyllabus(@Param('id', ParseObjectIdPipe) id: string) {
    return this.coursesService.removeSyllabus(id);
  }

  @Delete('admin/courses/:id/cover-image')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.COURSES_WRITE)
  @ApiOperation({ summary: 'Remove course cover image (Admin/Staff)' })
  async removeCoverImage(@Param('id', ParseObjectIdPipe) id: string) {
    return this.coursesService.removeCoverImage(id);
  }

  @Delete('admin/courses/:id')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.COURSES_WRITE)
  @ApiOperation({ summary: 'Delete course (Admin)' })
  async remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.coursesService.remove(id);
  }
}
