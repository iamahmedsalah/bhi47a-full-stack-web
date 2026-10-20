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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { QuizzesService, QuizListItem } from './quizzes.service';
import { PaginatedResult } from '../../common/utils/pagination.util';
import {
  CreateQuizDto,
  UpdateQuizDto,
  QueryQuizDto,
  SubmitQuizDto,
  SaveQuizDraftDto,
  ExitQuizAttemptDto,
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

  @Post('students/me/quizzes/:id/start')
  @Roles('student')
  @ApiOperation({
    summary:
      'Start or resume quiz attempt with server-enforced countdown timer and anti-cheat session security',
  })
  async startQuiz(
    @Param('id') quizId: string,
    @CurrentUser('_id') studentUserId: string,
  ) {
    return this.quizzesService.startQuizAttempt(quizId, studentUserId);
  }

  @Post('students/me/quizzes/:id/save-draft')
  @Roles('student')
  @ApiOperation({
    summary: 'Save in-progress draft answers to server attempt',
  })
  async saveDraft(
    @Param('id') quizId: string,
    @CurrentUser('_id') studentUserId: string,
    @Body() dto: SaveQuizDraftDto,
  ) {
    return this.quizzesService.saveDraft(quizId, studentUserId, dto);
  }

  @Post('students/me/quizzes/:id/exit')
  @Roles('student')
  @ApiOperation({
    summary:
      'Record student blur, tab-switch, or window exit event. Auto-terminates if allowResume is false.',
  })
  async recordExit(
    @Param('id') quizId: string,
    @CurrentUser('_id') studentUserId: string,
    @Body() dto: ExitQuizAttemptDto,
  ) {
    return this.quizzesService.recordExit(quizId, studentUserId, dto);
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

  @Get('students/me/quizzes/:id/review')
  @Roles('student')
  @ApiOperation({
    summary:
      'Review questions, model answers, and student choices after quiz deadline has ended',
  })
  async getQuizReview(
    @Param('id') quizId: string,
    @CurrentUser('_id') studentUserId: string,
  ) {
    return this.quizzesService.getQuizReview(quizId, studentUserId);
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

  @Get('admin/quizzes/questions-template')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.QUIZZES_WRITE)
  @ApiOperation({
    summary: 'Download standard Excel or CSV template for bulk quiz questions',
  })
  async downloadQuestionsTemplate(
    @Query('format') format: 'xlsx' | 'csv' = 'xlsx',
    @Res() res: Response,
  ) {
    const selectedFormat = format === 'csv' ? 'csv' : 'xlsx';
    const result =
      await this.quizzesService.generateQuestionsTemplate(selectedFormat);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
    );
    res.send(result.buffer);
  }

  @Post('admin/quizzes/parse-questions-file')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.QUIZZES_WRITE)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Parse and validate questions from uploaded Excel (.xlsx, .xls) or CSV',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async parseQuestionsFile(
    @UploadedFile() file?: { buffer: Buffer; originalname: string },
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('يرجى تحديد ملف Excel أو CSV لرفعه');
    }
    return this.quizzesService.parseQuestionsFile(
      file.buffer,
      file.originalname,
    );
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
  ): Promise<unknown[]> {
    return this.quizzesService.getSubmissions(id, user);
  }

  @Get('admin/quizzes/:id/export-analysis')
  @Roles('admin', 'staff')
  @RequirePermissions(PERMISSIONS.QUIZZES_SUBMISSIONS_READ)
  @ApiOperation({
    summary: 'Export styled Excel report of quiz analysis and submissions',
  })
  async exportAnalysis(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const result = await this.quizzesService.exportQuizAnalysis(id, user);
    res.setHeader('Content-Type', result.contentType);
    const asciiFallback = `quiz-analysis-${id}.xlsx`;
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
    );
    res.send(result.buffer);
  }
}
