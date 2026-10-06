import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { QuizzesService, QuizListItem } from './quizzes.service';
import { PaginatedResult } from '../../common/utils/pagination.util';
import {
  CreateQuizDto,
  UpdateQuizDto,
  QueryQuizDto,
  SubmitQuizDto,
} from './dto/quiz.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PERMISSIONS } from '@student-portal/shared';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';

@ApiTags('Quizzes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller()
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  // ─── Student Endpoints ───────────────────────────────────────────

  @Get('students/me/quizzes')
  @Roles('student')
  @ApiOperation({
    summary:
      'Get active and past quizzes for current student registered courses',
  })
  async getMyQuizzes(@CurrentUser('_id') studentUserId: string) {
    return this.quizzesService.getStudentQuizzes(studentUserId);
  }

  @Get('students/me/quizzes/:id/take')
  @Roles('student')
  @ApiOperation({
    summary: 'Get sanitized quiz questions to take (correct answers hidden)',
  })
  async getQuizForTaking(
    @Param('id') quizId: string,
    @CurrentUser('_id') studentUserId: string,
  ) {
    return this.quizzesService.getQuizForTaking(quizId, studentUserId);
  }

  @Post('students/me/quizzes/:id/submit')
  @Roles('student')
  @ApiOperation({
    summary: 'Submit answers for a quiz and get instant automated grading',
  })
  async submitQuiz(
    @Param('id') quizId: string,
    @CurrentUser('_id') studentUserId: string,
    @Body() dto: SubmitQuizDto,
  ) {
    return this.quizzesService.submitQuiz(quizId, studentUserId, dto);
  }

  // ─── Admin & Staff Management Endpoints ──────────────────────────

  @Get('admin/quizzes')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.QUIZZES_READ)
  @ApiOperation({ summary: 'List quizzes (Admin / Staff)' })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryQuizDto,
  ): Promise<PaginatedResult<QuizListItem>> {
    return this.quizzesService.findAll(user, query);
  }

  @Post('admin/quizzes')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.QUIZZES_WRITE)
  @ApiOperation({ summary: 'Create a new course quiz' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateQuizDto,
  ) {
    return this.quizzesService.create(user, dto);
  }

  @Get('admin/quizzes/:id')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.QUIZZES_READ)
  @ApiOperation({ summary: 'Get quiz details by ID' })
  async findOne(@Param('id') id: string) {
    return this.quizzesService.findOne(id);
  }

  @Patch('admin/quizzes/:id')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.QUIZZES_WRITE)
  @ApiOperation({ summary: 'Update quiz' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateQuizDto,
  ) {
    return this.quizzesService.update(id, user, dto);
  }

  @Delete('admin/quizzes/:id')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.QUIZZES_WRITE)
  @ApiOperation({ summary: 'Delete quiz' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quizzesService.remove(id, user);
  }

  @Get('admin/quizzes/:id/submissions')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.QUIZZES_SUBMISSIONS_READ)
  @ApiOperation({ summary: 'Get student submissions for a quiz' })
  async getSubmissions(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quizzesService.getSubmissions(id, user);
  }
}
