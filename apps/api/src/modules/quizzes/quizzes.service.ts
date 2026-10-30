import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Optional,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, FilterQuery } from 'mongoose';
import { Quiz, QuizDocument } from './schemas/quiz.schema';
import {
  QuizSubmission,
  QuizSubmissionDocument,
} from './schemas/quiz-submission.schema';
import {
  QuizAttempt,
  QuizAttemptDocument,
} from './schemas/quiz-attempt.schema';
import { Course, CourseDocument } from '../courses/schemas/course.schema';
import {
  CourseRegistration,
  CourseRegistrationDocument,
} from '../registrations/schemas/course-registration.schema';
import {
  StudentProfile,
  StudentProfileDocument,
} from '../students/schemas/student-profile.schema';
import {
  CreateQuizDto,
  UpdateQuizDto,
  QueryQuizDto,
  SubmitQuizDto,
  SaveQuizDraftDto,
  ExitQuizAttemptDto,
} from './dto/quiz.dto';
import {
  buildPaginationOptions,
  createPaginatedResult,
  PaginatedResult,
} from '../../common/utils/pagination.util';
import { normalizeSearchTerm } from '../../common/utils/search.util';
import { PERMISSIONS, type QuizReleaseMode } from '@student-portal/shared';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import { NotificationsService } from '../notifications/notifications.service';
import { QuizQuestionExcelService } from './services/quiz-question-excel.service';
import {
  getQuizReleaseState,
  type QuizReleaseSettings,
} from './quiz-release.policy';

export interface QuizListItem extends Record<string, unknown> {
  _id: any;
  title: string;
  titleAr?: string;
  description?: string;
  courseId: any;
  courseCode: string;
  courseName: string;
  creatorId: any;
  creatorName?: string;
  durationMinutes: number;
  totalMarks: number;
  passingMarks: number;
  startsAt?: Date;
  endsAt?: Date;
  allowResume?: boolean;
  publishResults?: boolean;
  resultsReleaseMode?: QuizReleaseMode;
  reviewReleaseMode?: QuizReleaseMode;
  resultsAvailable?: boolean;
  reviewAvailable?: boolean;
  isEnded?: boolean;
  isPublished: boolean;
  submissionsCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

import { MetricsService } from '../../core/metrics/metrics.service';
import { CacheService } from '../../core/cache/cache.service';
import { QueueService } from '../../core/queues/queue.service';

@Injectable()
export class QuizzesService implements OnModuleInit {
  constructor(
    @InjectModel(Quiz.name) private quizModel: Model<QuizDocument>,
    @InjectModel(QuizSubmission.name)
    private submissionModel: Model<QuizSubmissionDocument>,
    @InjectModel(QuizAttempt.name)
    private attemptModel: Model<QuizAttemptDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(CourseRegistration.name)
    private registrationModel: Model<CourseRegistrationDocument>,
    @InjectModel(StudentProfile.name)
    private studentProfileModel: Model<StudentProfileDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly excelService: QuizQuestionExcelService,
    @Optional() private readonly metricsService?: MetricsService,
    @Optional() private readonly cacheService?: CacheService,
    @Optional() private readonly queueService?: QueueService,
  ) {}

  onModuleInit(): void {
    if (this.queueService) {
      this.queueService.registerWorker<{
        attemptId: string;
        quizId: string;
        studentId: string;
      }>('quiz-queue', async (job) => {
        const { attemptId, quizId, studentId } = job.data;
        await this.handleAutoSubmitJob(attemptId, quizId, studentId);
      });
    }
  }

  async handleAutoSubmitJob(
    attemptId: string,
    quizId: string,
    studentId: string,
  ) {
    if (!Types.ObjectId.isValid(attemptId)) return;

    const attempt = await this.attemptModel.findById(attemptId);
    if (!attempt || attempt.status !== 'in_progress') {
      return;
    }

    const quiz = await this.quizModel.findById(quizId);
    if (!quiz) return;

    try {
      await this.autoSubmitAttempt(quiz, attempt, studentId, 'timed_out');
    } catch (err) {
      console.error(
        `Failed to auto-submit timed out quiz attempt ${attemptId}:`,
        err,
      );
    }
  }

  // ─── Staff / Admin Management ─────────────────────────────────────

  private checkCourseDoctor(
    course: any,
    userId: string | Types.ObjectId,
  ): boolean {
    if (!course || !userId) return false;
    const userIdStr = userId.toString();
    if (course.doctorId && course.doctorId.toString() === userIdStr) {
      return true;
    }
    if (Array.isArray(course.doctorIds)) {
      return course.doctorIds.some(
        (id: any) => id && id.toString() === userIdStr,
      );
    }
    return false;
  }

  async create(
    user: AuthenticatedUser,
    dto: CreateQuizDto,
  ): Promise<QuizDocument> {
    if (!Types.ObjectId.isValid(dto.courseId)) {
      throw new BadRequestException('معرف المقرر غير صالح');
    }

    const course = await this.courseModel.findById(dto.courseId);
    if (!course) {
      throw new NotFoundException('المقرر الدراسي غير موجود');
    }

    // Permission check: admin OR course doctor OR course teaching assistant OR has QUIZZES_WRITE
    if (user.role === 'staff') {
      const isCourseDoctor = this.checkCourseDoctor(course, user._id);
      const isCourseTA =
        Array.isArray((course as any).teachingAssistantIds) &&
        (course as any).teachingAssistantIds.some(
          (taId: any) => taId.toString() === user._id.toString(),
        );
      const isAssigned = isCourseDoctor || isCourseTA;
      if (
        (user.staffType === 'doctor' ||
          user.staffType === 'teaching_assistant') &&
        !isAssigned
      ) {
        throw new ForbiddenException(
          'يمكنك فقط إنشاء اختبارات للمقررات الدراسية المسندة إليك',
        );
      }
      const hasWritePerm = user.permissions?.includes(
        PERMISSIONS.QUIZZES_WRITE,
      );
      if (!isAssigned && !hasWritePerm) {
        throw new ForbiddenException(
          'غير مصرح لك بإنشاء اختبار لهذا المقرر (يجب أن تكون أستاذ المقرر أو معيده أو تمتلك صلاحية)',
        );
      }
    }

    const totalMarks = (dto.questions || []).reduce(
      (sum, q) => sum + (Number(q.points) || 1),
      0,
    );
    const passingMarks = Math.max(1, Math.round(totalMarks * 0.5));
    const durationMinutes = Number(dto.durationMinutes) || 15;

    const startsAtVal = dto.startsAt || dto.open_at;
    const endsAtVal = dto.endsAt || dto.close_at;

    if (
      startsAtVal &&
      new Date(startsAtVal).getTime() < Date.now() - 5 * 60 * 1000
    ) {
      throw new BadRequestException(
        'موعد فتح الاختبار لا يمكن أن يكون في وقت سابق لتاريخ ولحظة الآن',
      );
    }

    if (endsAtVal && new Date(endsAtVal).getTime() < Date.now()) {
      throw new BadRequestException(
        'موعد إغلاق الاختبار لا يمكن أن يكون في الماضي',
      );
    }

    if (startsAtVal && endsAtVal) {
      const s = new Date(startsAtVal);
      const e = new Date(endsAtVal);
      if (e <= s) {
        throw new BadRequestException(
          'موعد نهاية الاختبار يجب أن يكون بعد موعد البداية',
        );
      }
      const windowMinutes = (e.getTime() - s.getTime()) / (60 * 1000);
      if (windowMinutes < durationMinutes) {
        throw new BadRequestException(
          `نافذة إتاحة الاختبار (${Math.round(windowMinutes)} دقيقة) يجب أن تكون كافية لمدة الاختبار على الأقل (${durationMinutes} دقيقة)`,
        );
      }
    } else if (!startsAtVal && endsAtVal) {
      const remainingMinutes =
        (new Date(endsAtVal).getTime() - Date.now()) / (60 * 1000);
      if (remainingMinutes < durationMinutes) {
        throw new BadRequestException(
          `الوقت المتبقي حتى إغلاق الاختبار أقل من مدة الاختبار (${durationMinutes} دقيقة)`,
        );
      }
    }

    const quiz = new this.quizModel({
      ...dto,
      courseId: new Types.ObjectId(dto.courseId),
      courseCode: course.code,
      courseName: course.nameAr || course.name,
      courseNameAr: course.nameAr || course.name,
      courseNameEn: course.name || course.nameAr,
      creatorId: new Types.ObjectId(user._id),
      creatorName: user.name,
      durationMinutes,
      totalMarks,
      passingMarks,
      startsAt: startsAtVal ? new Date(startsAtVal) : undefined,
      endsAt: endsAtVal ? new Date(endsAtVal) : undefined,
      allowResume:
        dto.allowResume !== undefined ? Boolean(dto.allowResume) : true,
      publishResults: Boolean(dto.publishResults ?? false),
      allowReview: dto.allowReview ?? false,
      resultsReleaseMode: dto.resultsReleaseMode ?? (endsAtVal ? 'after_close' : 'manual'),
      reviewReleaseMode: dto.reviewReleaseMode ?? 'manual',
    });

    this.validateReleaseSettings(quiz);

    const saved = await quiz.save();

    if (saved.isPublished) {
      this.sendQuizNotification(saved, course, user._id).catch((err) => {
        console.error('Failed to dispatch quiz notification:', err);
      });
    }

    return saved;
  }

  async findAll(
    user: AuthenticatedUser,
    query: QueryQuizDto,
  ): Promise<PaginatedResult<QuizListItem>> {
    const { page, limit, skip } = buildPaginationOptions(query);
    const filter: FilterQuery<QuizDocument> = {};

    // If doctor, teaching assistant or staff without full permissions, restrict to assigned courses or created quizzes
    if (
      user.role === 'staff' &&
      (user.staffType === 'doctor' ||
        user.staffType === 'teaching_assistant' ||
        !user.permissions?.includes(PERMISSIONS.QUIZZES_WRITE))
    ) {
      const assignedCourses = await this.courseModel
        .find({
          $or: [
            { doctorId: new Types.ObjectId(user._id) },
            { doctorIds: new Types.ObjectId(user._id) },
            { teachingAssistantIds: new Types.ObjectId(user._id) },
          ],
        })
        .select('_id')
        .lean();
      const courseIds = assignedCourses.map((c) => c._id);

      filter.$or = [
        { creatorId: new Types.ObjectId(user._id) },
        { courseId: { $in: courseIds } },
      ];
    }

    if (query.courseId && Types.ObjectId.isValid(query.courseId)) {
      filter.courseId = new Types.ObjectId(query.courseId);
    }

    if (query.isPublished !== undefined) {
      filter.isPublished = query.isPublished;
    }

    if (query.search) {
      const search = normalizeSearchTerm(query.search);
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { titleAr: { $regex: search, $options: 'i' } },
          { courseCode: { $regex: search, $options: 'i' } },
          { courseName: { $regex: search, $options: 'i' } },
        ],
      });
    }

    const [items, total] = await Promise.all([
      this.quizModel
        .find(filter)
        .select(
          '_id title titleAr description courseId courseCode courseName courseNameAr courseNameEn creatorId creatorName isPublished durationMinutes totalMarks passingMarks startsAt endsAt allowReview allowResume publishResults resultsReleaseMode reviewReleaseMode questions createdAt updatedAt',
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.quizModel.countDocuments(filter),
    ]);

    const quizIds = items.map((q) => q._id);
    const courseIds = Array.from(
      new Set(items.map((q) => q.courseId?.toString()).filter(Boolean)),
    );
    const [counts, courses] = await Promise.all([
      this.submissionModel.aggregate([
        { $match: { quizId: { $in: quizIds } } },
        { $group: { _id: '$quizId', count: { $sum: 1 } } },
      ]),
      courseIds.length > 0
        ? this.courseModel
            .find({ _id: { $in: courseIds } })
            .select('_id name nameAr nameEn code')
            .lean()
        : Promise.resolve([]),
    ]);
    const countsMap = new Map(counts.map((c) => [c._id.toString(), c.count]));
    const coursesMap = new Map(courses.map((c) => [c._id.toString(), c]));

    const decorated = items.map((q) => {
      const course = q.courseId
        ? coursesMap.get(q.courseId.toString())
        : undefined;
      return {
        ...q,
        ...getQuizReleaseState(q),
        resultsReleaseMode: q.resultsReleaseMode ?? 'manual',
        reviewReleaseMode: q.reviewReleaseMode ?? 'manual',
        courseNameAr: q.courseNameAr || course?.nameAr || q.courseName,
        courseNameEn:
          q.courseNameEn ||
          course?.name ||
          (course as any)?.nameEn ||
          q.courseName,
        submissionsCount: countsMap.get(q._id.toString()) || 0,
      };
    });

    return createPaginatedResult(decorated, total, page, limit);
  }

  async findOne(id: string): Promise<QuizDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('معرف الاختبار غير صالح');
    }
    const quiz = await this.quizModel.findById(id);
    if (!quiz) {
      throw new NotFoundException('الاختبار غير موجود');
    }
    return quiz;
  }

  managementView(quiz: QuizDocument) {
    return {
      ...quiz.toObject(),
      ...getQuizReleaseState(quiz),
      resultsReleaseMode: quiz.resultsReleaseMode ?? 'manual',
      reviewReleaseMode: quiz.reviewReleaseMode ?? 'manual',
    };
  }

  private validateReleaseSettings(
    quiz: Pick<
      QuizReleaseSettings,
      'endsAt' | 'resultsReleaseMode' | 'reviewReleaseMode'
    >,
  ): void {
    if (
      (quiz.resultsReleaseMode === 'after_close' ||
        quiz.reviewReleaseMode === 'after_close') &&
      (!quiz.endsAt || !Number.isFinite(new Date(quiz.endsAt).getTime()))
    ) {
      throw new BadRequestException(
        'Automatic release requires a valid quiz closing time / الإتاحة التلقائية تتطلب موعد إغلاق صالحاً للاختبار',
      );
    }
  }

  async update(
    id: string,
    user: AuthenticatedUser,
    dto: UpdateQuizDto,
  ): Promise<QuizDocument> {
    const quiz = await this.findOne(id);

    // Permission check
    if (user.role === 'staff') {
      const isCreator = quiz.creatorId
        ? quiz.creatorId.toString() === user._id.toString()
        : false;
      const course = await this.courseModel
        .findById(quiz.courseId)
        .select('doctorId doctorIds teachingAssistantIds')
        .lean();
      const isCourseDoctor = this.checkCourseDoctor(course, user._id);
      const isCourseTA =
        Array.isArray((course as any)?.teachingAssistantIds) &&
        (course as any).teachingAssistantIds.some(
          (taId: any) => taId.toString() === user._id.toString(),
        );
      const isAssigned = isCourseDoctor || isCourseTA;
      if (
        (user.staffType === 'doctor' ||
          user.staffType === 'teaching_assistant') &&
        !isCreator &&
        !isAssigned
      ) {
        throw new ForbiddenException(
          'يمكنك فقط تعديل الاختبارات للمقررات المسندة إليك',
        );
      }
      const hasWritePerm = user.permissions?.includes(
        PERMISSIONS.QUIZZES_WRITE,
      );
      if (!isCreator && !isCourseDoctor && !hasWritePerm) {
        throw new ForbiddenException('غير مصرح لك بتعديل هذا الاختبار');
      }
    }

    const updatePayload: Record<string, any> = { ...dto };
    delete updatePayload.courseId;
    if (dto.questions) {
      updatePayload.totalMarks = dto.questions.reduce(
        (sum, q) => sum + (Number(q.points) || 1),
        0,
      );
      updatePayload.passingMarks = Math.max(
        1,
        Math.round(updatePayload.totalMarks * 0.5),
      );
    }

    const startsAtVal = dto.startsAt !== undefined ? dto.startsAt : dto.open_at;
    const endsAtVal = dto.endsAt !== undefined ? dto.endsAt : dto.close_at;

    if (
      startsAtVal &&
      new Date(startsAtVal).getTime() !==
        new Date(quiz.startsAt || 0).getTime() &&
      new Date(startsAtVal).getTime() < Date.now() - 5 * 60 * 1000
    ) {
      throw new BadRequestException(
        'لا يمكن تحديد موعد فتح الاختبار في وقت سابق لتاريخ ولحظة الآن',
      );
    }

    if (
      endsAtVal &&
      new Date(endsAtVal).getTime() !== new Date(quiz.endsAt || 0).getTime() &&
      new Date(endsAtVal).getTime() < Date.now()
    ) {
      throw new BadRequestException(
        'لا يمكن تحديد موعد إغلاق الاختبار في وقت سابق لتاريخ ولحظة الآن',
      );
    }

    if (startsAtVal !== undefined) {
      updatePayload.startsAt = startsAtVal ? new Date(startsAtVal) : undefined;
    }
    if (endsAtVal !== undefined) {
      updatePayload.endsAt = endsAtVal ? new Date(endsAtVal) : undefined;
    }
    if (dto.allowResume !== undefined) {
      updatePayload.allowResume = Boolean(dto.allowResume);
    }
    if (dto.allowReview !== undefined) {
      updatePayload.allowReview = Boolean(dto.allowReview);
    }
    if (dto.publishResults !== undefined) {
      updatePayload.publishResults = Boolean(dto.publishResults);
    }

    const effectiveStartsAt =
      updatePayload.startsAt !== undefined
        ? updatePayload.startsAt
        : quiz.startsAt;
    const effectiveEndsAt =
      endsAtVal !== undefined
        ? endsAtVal
          ? new Date(endsAtVal)
          : undefined
        : quiz.endsAt;
    const effectiveDuration =
      updatePayload.durationMinutes !== undefined
        ? Number(updatePayload.durationMinutes)
        : quiz.durationMinutes;

    this.validateReleaseSettings({
      endsAt: effectiveEndsAt,
      resultsReleaseMode: dto.resultsReleaseMode ?? quiz.resultsReleaseMode,
      reviewReleaseMode: dto.reviewReleaseMode ?? quiz.reviewReleaseMode,
    });

    if (effectiveStartsAt && effectiveEndsAt) {
      const s = new Date(effectiveStartsAt);
      const e = new Date(effectiveEndsAt);
      if (e <= s) {
        throw new BadRequestException(
          'موعد نهاية الاختبار يجب أن يكون بعد موعد البداية',
        );
      }
      const windowMinutes = (e.getTime() - s.getTime()) / (60 * 1000);
      if (windowMinutes < effectiveDuration) {
        throw new BadRequestException(
          `نافذة إتاحة الاختبار (${Math.round(windowMinutes)} دقيقة) يجب أن تكون كافية لمدة الاختبار على الأقل (${effectiveDuration} دقيقة)`,
        );
      }
    }

    const updated = await this.quizModel.findByIdAndUpdate(
      id,
      { $set: updatePayload },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('الاختبار غير موجود');
    }

    if (this.cacheService) {
      await this.cacheService.del(`quiz:manifest:${id}`);
    }

    if (!quiz.isPublished && updated.isPublished) {
      this.courseModel
        .findById(updated.courseId)
        .then((course) => {
          if (course) {
            this.sendQuizNotification(updated, course, user._id).catch((err) =>
              console.error('Failed to notify quiz publication:', err),
            );
          }
        })
        .catch((err) =>
          console.error('Error fetching course for quiz notification:', err),
        );
    }

    return updated;
  }

  async remove(
    id: string,
    user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const quiz = await this.findOne(id);

    if (user.role === 'staff') {
      const isCreator = quiz.creatorId
        ? quiz.creatorId.toString() === user._id.toString()
        : false;
      const course = await this.courseModel
        .findById(quiz.courseId)
        .select('doctorId doctorIds teachingAssistantIds')
        .lean();
      const isCourseDoctor = this.checkCourseDoctor(course, user._id);
      const isCourseTA =
        Array.isArray((course as any)?.teachingAssistantIds) &&
        (course as any).teachingAssistantIds.some(
          (taId: any) => taId.toString() === user._id.toString(),
        );
      const isAssigned = isCourseDoctor || isCourseTA;
      if (
        (user.staffType === 'doctor' ||
          user.staffType === 'teaching_assistant') &&
        !isCreator &&
        !isAssigned
      ) {
        throw new ForbiddenException(
          'يمكنك فقط حذف الاختبارات للمقررات المسندة إليك',
        );
      }
      const hasWritePerm = user.permissions?.includes(
        PERMISSIONS.QUIZZES_WRITE,
      );
      if (!isCreator && !isCourseDoctor && !hasWritePerm) {
        throw new ForbiddenException('غير مصرح لك بحذف هذا الاختبار');
      }
    }

    await Promise.all([
      this.quizModel.findByIdAndDelete(id),
      this.submissionModel.deleteMany({ quizId: new Types.ObjectId(id) }),
      this.attemptModel.deleteMany({ quizId: new Types.ObjectId(id) }),
    ]);

    if (this.cacheService) {
      await this.cacheService.del(`quiz:manifest:${id}`);
    }

    return { message: 'تم حذف الاختبار وسجلاته بنجاح' };
  }

  async getSubmissions(
    quizId: string,
    user?: AuthenticatedUser,
  ): Promise<
    Array<{
      _id: unknown;
      quizId: unknown;
      courseId: unknown;
      studentId: unknown;
      studentCode: string;
      studentName: string;
      studentNameAr?: string;
      studentNameEn?: string;
      score: number;
      totalMarks: number;
      percentage: number;
      isPassed: boolean;
      submittedAt: Date;
      startedAt?: Date;
      durationSeconds?: number;
      answers?: unknown[];
    }>
  > {
    const quiz = await this.findOne(quizId);
    if (
      user &&
      user.role === 'staff' &&
      (user.staffType === 'doctor' || user.staffType === 'teaching_assistant')
    ) {
      const isCreator = quiz.creatorId
        ? quiz.creatorId.toString() === user._id.toString()
        : false;
      const course = await this.courseModel
        .findById(quiz.courseId)
        .select('doctorId doctorIds teachingAssistantIds')
        .lean();
      const isCourseDoctor = this.checkCourseDoctor(course, user._id);
      const isCourseTA =
        Array.isArray((course as any)?.teachingAssistantIds) &&
        (course as any).teachingAssistantIds.some(
          (taId: any) => taId.toString() === user._id.toString(),
        );
      const isAssigned = isCourseDoctor || isCourseTA;
      if (!isCreator && !isAssigned) {
        throw new ForbiddenException(
          'غير مصرح لك بالاطلاع على تسليمات هذا الاختبار',
        );
      }
    }
    const submissions = await this.submissionModel
      .find({ quizId: new Types.ObjectId(quizId) })
      .sort({ submittedAt: -1 })
      .lean();

    if (submissions.length === 0) return [];

    const studentCodes = Array.from(
      new Set(submissions.map((s) => s.studentCode).filter(Boolean)),
    );
    const profiles = await this.studentProfileModel
      .find({ studentCode: { $in: studentCodes } })
      .select('studentCode fullName fullNameAr fullNameEn')
      .lean();
    const profileMap = new Map(profiles.map((p) => [p.studentCode, p]));

    return submissions.map((sub) => {
      const profile = profileMap.get(sub.studentCode);
      const studentNameAr =
        sub.studentNameAr ||
        profile?.fullNameAr ||
        profile?.fullName ||
        sub.studentName;
      const studentNameEn =
        profile?.fullNameEn || profile?.fullName || sub.studentName;
      return {
        ...sub,
        studentNameAr,
        studentNameEn,
      };
    });
  }

  async exportQuizAnalysis(quizId: string, user: AuthenticatedUser) {
    const quiz = await this.findOne(quizId);
    if (
      user.role === 'staff' &&
      (user.staffType === 'doctor' || user.staffType === 'teaching_assistant')
    ) {
      const isCreator = quiz.creatorId
        ? quiz.creatorId.toString() === user._id.toString()
        : false;
      const course = await this.courseModel
        .findById(quiz.courseId)
        .select('doctorId doctorIds teachingAssistantIds')
        .lean();
      const isCourseDoctor = this.checkCourseDoctor(course, user._id);
      const isCourseTA =
        Array.isArray((course as any)?.teachingAssistantIds) &&
        (course as any).teachingAssistantIds.some(
          (taId: any) => taId.toString() === user._id.toString(),
        );
      const isAssigned = isCourseDoctor || isCourseTA;
      if (!isCreator && !isAssigned) {
        throw new ForbiddenException('غير مصرح لك بتصدير تحليل هذا الاختبار');
      }
    }
    const submissions = await this.getSubmissions(quizId, user);

    return this.excelService.generateQuizAnalysisExcel(
      quiz as any,
      submissions,
    );
  }

  // ─── Question Import & Template ───────────────────────────────────

  async parseQuestionsFile(buffer: Buffer, originalFilename: string) {
    return this.excelService.parseQuestionsFile(buffer, originalFilename);
  }

  async generateQuestionsTemplate(format: 'xlsx' | 'csv' = 'xlsx') {
    return this.excelService.generateSampleTemplate(format);
  }

  // ─── Student Operations ───────────────────────────────────────────

  async getStudentQuizzes(studentUserId: string) {
    if (!Types.ObjectId.isValid(studentUserId)) return [];

    const studentUserObjectId = new Types.ObjectId(studentUserId);

    // 1. Find registered courses for current term (project only courses field)
    const registrations = await this.registrationModel
      .find({
        studentId: studentUserObjectId,
        status: { $in: ['approved', 'registered', 'confirmed'] },
      })
      .select('courses')
      .sort({ createdAt: -1 })
      .limit(3)
      .lean();

    const registeredCodes = new Set<string>();
    for (const reg of registrations) {
      for (const c of reg.courses || []) {
        if (typeof c === 'string') {
          registeredCodes.add(c.toUpperCase());
        }
      }
    }

    if (registeredCodes.size === 0) {
      return [];
    }

    const rawCodes = Array.from(registeredCodes);
    const validObjectIds = rawCodes
      .filter((code) => Types.ObjectId.isValid(code))
      .map((id) => new Types.ObjectId(id));

    const courseFilter =
      validObjectIds.length > 0
        ? {
            $or: [
              { code: { $in: rawCodes } },
              { _id: { $in: validObjectIds } },
            ],
            isActive: true,
          }
        : {
            code: { $in: rawCodes },
            isActive: true,
          };

    const registeredCourses = await this.courseModel
      .find(courseFilter)
      .select('_id')
      .lean();

    if (registeredCourses.length === 0) {
      return [];
    }

    const courseObjectIds = registeredCourses.map((c) => c._id);

    // 2. Find published quizzes for these courses
    const quizzes = await this.quizModel
      .find({
        courseId: { $in: courseObjectIds },
        isPublished: true,
      })
      .select(
        '_id title titleAr description courseId courseCode courseName courseNameAr courseNameEn creatorName isPublished durationMinutes totalMarks passingMarks startsAt endsAt allowResume allowReview publishResults resultsReleaseMode reviewReleaseMode questions.id',
      )
      .sort({ createdAt: -1 })
      .lean();

    if (quizzes.length === 0) return [];

    // 3. Find student's submissions and active attempts in parallel with narrow projections
    const quizIds = quizzes.map((q) => q._id);
    const [submissions, attempts] = await Promise.all([
      this.submissionModel
        .find({
          quizId: { $in: quizIds },
          studentId: studentUserObjectId,
        })
        .select(
          'quizId score totalMarks percentage isPassed submittedAt durationSeconds',
        )
        .lean(),
      this.attemptModel
        .find({
          quizId: { $in: quizIds },
          studentId: studentUserObjectId,
        })
        .select('quizId status')
        .lean(),
    ]);

    const submissionsMap = new Map(
      submissions.map((s) => [s.quizId.toString(), s]),
    );
    const attemptsMap = new Map(attempts.map((a) => [a.quizId.toString(), a]));

    const nowMs = Date.now();

    return quizzes.map((quiz) => {
      const qIdStr = quiz._id.toString();
      const submission = submissionsMap.get(qIdStr);
      const attempt = attemptsMap.get(qIdStr);
      const startsAtMs = quiz.startsAt ? new Date(quiz.startsAt).getTime() : 0;
      const isStarted = !startsAtMs || startsAtMs <= nowMs;
      const { isEnded, resultsAvailable, reviewAvailable } =
        getQuizReleaseState(quiz, nowMs);
      const isOpen = isStarted && !isEnded;

      return {
        _id: quiz._id,
        title: quiz.title,
        titleAr: quiz.titleAr,
        description: quiz.description,
        courseId: quiz.courseId,
        courseCode: quiz.courseCode,
        courseName: quiz.courseName,
        courseNameAr: quiz.courseNameAr,
        courseNameEn: quiz.courseNameEn,
        creatorName: quiz.creatorName,
        durationMinutes: quiz.durationMinutes,
        totalMarks: quiz.totalMarks,
        passingMarks: quiz.passingMarks,
        questionsCount: quiz.questions?.length || 0,
        startsAt: quiz.startsAt,
        endsAt: quiz.endsAt,
        allowResume: quiz.allowResume !== false,
        allowReview: Boolean(quiz.allowReview ?? true),
        resultsReleaseMode: quiz.resultsReleaseMode ?? 'manual',
        reviewReleaseMode: quiz.reviewReleaseMode ?? 'manual',
        publishResults: resultsAvailable,
        canReview: reviewAvailable && Boolean(submission),
        isOpen,
        isEnded,
        isSubmitted: Boolean(submission),
        attemptStatus: attempt?.status,
        submission: submission
          ? {
              score: resultsAvailable ? submission.score : undefined,
              totalMarks: submission.totalMarks,
              percentage: resultsAvailable ? submission.percentage : undefined,
              isPassed: resultsAvailable ? submission.isPassed : undefined,
              submittedAt: submission.submittedAt,
              durationSeconds: submission.durationSeconds,
            }
          : undefined,
      };
    });
  }

  async getQuizForTaking(quizId: string, studentUserId: string) {
    const studentUserObjectId = new Types.ObjectId(studentUserId);

    const [quiz, existing, profile] = await Promise.all([
      this.findOne(quizId),
      this.submissionModel.findOne({
        quizId: new Types.ObjectId(quizId),
        studentId: studentUserObjectId,
      }),
      this.studentProfileModel
        .findOne({ userId: studentUserObjectId })
        .select('isBlocked')
        .lean(),
    ]);

    if (profile?.isBlocked) {
      throw new ForbiddenException(
        'عفواً، لا يمكنك الوصول للاختبار نظراً لحجب الحساب لعدم سداد المصروفات الدراسية. يرجى مراجعة شؤون الطلاب وإدارة المعهد.',
      );
    }

    if (!quiz.isPublished) {
      throw new ForbiddenException('هذا الاختبار غير متاح حالياً');
    }

    const now = new Date();
    if (quiz.startsAt && new Date(quiz.startsAt) > now) {
      throw new ForbiddenException('لم يبدأ موعد الاختبار بعد');
    }
    if (quiz.endsAt && new Date(quiz.endsAt) <= now) {
      throw new ForbiddenException('انتهى موعد تقديم الاختبار');
    }

    // Check if already submitted
    if (existing) {
      throw new ConflictException('لقد قمت بتقديم هذا الاختبار بالفعل');
    }

    const quizDurationSeconds = Math.max(60, (quiz.durationMinutes || 30) * 60);
    if (this.cacheService) {
      return this.cacheService.wrap(
        `quiz:manifest:${quizId}`,
        () => Promise.resolve(this.sanitizeQuiz(quiz)),
        quizDurationSeconds,
      );
    }

    return this.sanitizeQuiz(quiz);
  }

  /**
   * Start / resume quiz attempt with server-enforced countdown timer and anti-cheat session security.
   */
  async startQuizAttempt(quizId: string, studentUserId: string) {
    const studentUserObjectId = new Types.ObjectId(studentUserId);

    const [quiz, profile] = await Promise.all([
      this.findOne(quizId),
      this.studentProfileModel
        .findOne({ userId: studentUserObjectId })
        .select('isBlocked')
        .lean(),
    ]);

    if (profile?.isBlocked) {
      throw new ForbiddenException(
        'عفواً، لا يمكنك خوض الاختبار نظراً لحجب الحساب لعدم سداد المصروفات الدراسية. يرجى مراجعة شؤون الطلاب وإدارة المعهد.',
      );
    }

    if (!quiz.isPublished) {
      throw new ForbiddenException('هذا الاختبار غير متاح حالياً');
    }

    const now = Date.now();
    if (quiz.startsAt && new Date(quiz.startsAt).getTime() > now) {
      throw new ForbiddenException('لم يبدأ موعد الاختبار بعد');
    }
    if (quiz.endsAt && new Date(quiz.endsAt).getTime() <= now) {
      throw new ForbiddenException('انتهى موعد تقديم الاختبار');
    }

    // Check final submission
    const existingSubmission = await this.submissionModel.findOne({
      quizId: quiz._id,
      studentId: studentUserObjectId,
    });
    if (existingSubmission) {
      throw new ConflictException('لقد قمت بتقديم هذا الاختبار بالفعل');
    }

    let attempt = await this.attemptModel.findOne({
      quizId: quiz._id,
      studentId: studentUserObjectId,
    });

    if (attempt) {
      if (
        attempt.status === 'submitted' ||
        attempt.status === 'terminated_by_exit'
      ) {
        throw new ForbiddenException(
          'تم إنهاء جلسة هذا الاختبار مسبقاً ولا يمكن الدخول مجدداً',
        );
      }

      if (attempt.status === 'timed_out') {
        throw new ForbiddenException('انتهى الوقت المخصص للاختبار مسبقاً');
      }

      if (attempt.status === 'in_progress') {
        if (quiz.allowResume === false && (attempt.exitCount || 0) >= 2) {
          // Strict anti-cheat: terminated only when max allowed violations (>= 2) exceeded
          attempt.status = 'terminated_by_exit';
          await attempt.save();
          await this.autoSubmitAttempt(
            quiz,
            attempt,
            studentUserId,
            'terminated_by_exit',
          );
          throw new ForbiddenException(
            'تم إنهاء محاولة هذا الاختبار بسبب تكرار مغادرة الصفحة ولا يمكن استئنافه (وضع الاختبار المشدد)',
          );
        }

        // Calculate server-side remaining time
        const attemptStartMs = attempt.startedAt.getTime();
        const totalDurationSec = (quiz.durationMinutes || 15) * 60;
        const elapsedSec = Math.max(
          0,
          Math.floor((now - attemptStartMs) / 1000),
        );
        let remSec = Math.max(0, totalDurationSec - elapsedSec);

        if (quiz.endsAt) {
          const remToEndSec = Math.max(
            0,
            Math.floor((new Date(quiz.endsAt).getTime() - now) / 1000),
          );
          remSec = Math.min(remSec, remToEndSec);
        }

        if (remSec <= 0) {
          await this.autoSubmitAttempt(
            quiz,
            attempt,
            studentUserId,
            'timed_out',
          );
          throw new ForbiddenException(
            'انتهى الوقت المخصص للاختبار وتم حفظ إجاباتك تلقائياً',
          );
        }

        attempt.lastActiveAt = new Date();
        await attempt.save();

        const cleanDraftAnswers = (attempt.draftAnswers || []).filter(
          (a) =>
            a &&
            typeof a.questionId === 'string' &&
            a.questionId.trim().length > 0 &&
            typeof a.selectedOptionIndex === 'number' &&
            a.selectedOptionIndex >= 0,
        );

        const resumeDelayMs = Math.max(10, remSec + 15) * 1000;
        if (this.queueService) {
          this.queueService
            .add(
              'quiz-queue',
              'auto-submit',
              {
                attemptId: attempt._id.toString(),
                quizId: quiz._id.toString(),
                studentId: studentUserId,
              },
              undefined,
              {
                delay: resumeDelayMs,
                jobId: `quiz-autosubmit:${attempt._id.toString()}`,
              },
            )
            .catch((err) =>
              console.error(
                'Failed to schedule quiz auto-submit delayed job on resume:',
                err,
              ),
            );
        }

        return {
          quiz: this.sanitizeQuiz(quiz),
          attemptId: attempt._id,
          startedAt: attempt.startedAt,
          expiresAt: attempt.expiresAt,
          remainingSeconds: remSec,
          allowResume: quiz.allowResume !== false,
          draftAnswers: cleanDraftAnswers,
          isResumed: true,
        };
      }
    }

    // New attempt creation
    const durationMs = (quiz.durationMinutes || 15) * 60 * 1000;
    const targetExpireMs = now + durationMs;
    const effectiveExpireMs = quiz.endsAt
      ? Math.min(targetExpireMs, new Date(quiz.endsAt).getTime())
      : targetExpireMs;
    const expiresAt = new Date(effectiveExpireMs);
    const remainingSeconds = Math.max(
      0,
      Math.floor((effectiveExpireMs - now) / 1000),
    );

    attempt = new this.attemptModel({
      quizId: quiz._id,
      courseId: quiz.courseId,
      studentId: studentUserObjectId,
      startedAt: new Date(now),
      expiresAt,
      status: 'in_progress',
      allowResume: quiz.allowResume !== false,
      draftAnswers: [],
      exitCount: 0,
      lastActiveAt: new Date(now),
    });

    await attempt.save();
    this.metricsService?.updateActiveQuizAttempts(1);

    const initialDelayMs = Math.max(10, remainingSeconds + 15) * 1000;
    if (this.queueService) {
      this.queueService
        .add(
          'quiz-queue',
          'auto-submit',
          {
            attemptId: attempt._id.toString(),
            quizId: quiz._id.toString(),
            studentId: studentUserId,
          },
          undefined,
          {
            delay: initialDelayMs,
            jobId: `quiz-autosubmit:${attempt._id.toString()}`,
          },
        )
        .catch((err) =>
          console.error(
            'Failed to schedule quiz auto-submit delayed job on create:',
            err,
          ),
        );
    }

    return {
      quiz: this.sanitizeQuiz(quiz),
      attemptId: attempt._id,
      startedAt: attempt.startedAt,
      expiresAt: attempt.expiresAt,
      remainingSeconds,
      allowResume: quiz.allowResume !== false,
      draftAnswers: [],
      isResumed: false,
    };
  }

  /**
   * Save student's answer draft to the server attempt document.
   */
  async saveDraft(
    quizId: string,
    studentUserId: string,
    dto: SaveQuizDraftDto,
  ) {
    const now = new Date();
    const cleanAnswers = (dto.answers || []).filter(
      (a) =>
        a &&
        typeof a.questionId === 'string' &&
        a.questionId.trim().length > 0 &&
        typeof a.selectedOptionIndex === 'number' &&
        a.selectedOptionIndex >= 0,
    );

    const updated = await this.attemptModel.findOneAndUpdate(
      {
        quizId: new Types.ObjectId(quizId),
        studentId: new Types.ObjectId(studentUserId),
        status: 'in_progress',
      },
      {
        $set: {
          draftAnswers: cleanAnswers,
          lastActiveAt: now,
        },
      },
      { new: true },
    );

    if (!updated) {
      return { success: false, message: 'لا توجد جلسة اختبار نشطة' };
    }

    return { success: true, savedAt: now };
  }

  /**
   * Record window exit, blur, or tab switch event during quiz attempt.
   */
  async recordExit(
    quizId: string,
    studentUserId: string,
    dto: ExitQuizAttemptDto,
  ) {
    const quiz = await this.findOne(quizId);
    const attempt = await this.attemptModel.findOne({
      quizId: new Types.ObjectId(quizId),
      studentId: new Types.ObjectId(studentUserId),
      status: 'in_progress',
    });

    if (!attempt) {
      return { handled: false };
    }

    const cleanAnswers = (dto.answers || []).filter(
      (a) =>
        a &&
        typeof a.questionId === 'string' &&
        a.questionId.trim().length > 0 &&
        typeof a.selectedOptionIndex === 'number' &&
        a.selectedOptionIndex >= 0,
    );

    if (cleanAnswers.length > 0) {
      attempt.draftAnswers = cleanAnswers;
    }

    if (quiz.allowResume === false) {
      const exitCount = (attempt.exitCount || 0) + 1;
      attempt.exitCount = exitCount;
      if (cleanAnswers.length > 0) {
        attempt.draftAnswers = cleanAnswers;
      }
      attempt.lastActiveAt = new Date();
      await attempt.save();

      // Only terminate and auto-submit if threshold reached (>= 2 exits) or explicitly requested
      if (exitCount >= 2 || dto.reason === 'force_terminate') {
        this.metricsService?.recordAntiCheatViolation(dto.reason || 'exit');
        this.metricsService?.updateActiveQuizAttempts(-1);
        const submission = await this.autoSubmitAttempt(
          quiz,
          attempt,
          studentUserId,
          'terminated_by_exit',
        );

        return {
          status: 'terminated_by_exit',
          exitCount,
          maxAllowedExits: 1,
          message:
            'تم إنهاء الاختبار وتسليمه تلقائياً بسبب تكرار مغادرة الصفحة أو تبديل التبويب (الوضع المشدد)',
          submission: this.studentSubmissionView(quiz, submission),
        };
      }

      this.metricsService?.recordAntiCheatViolation('warning_exit_1');
      return {
        status: 'warning',
        exitCount,
        maxAllowedExits: 1,
        message:
          'تحذير: تم رصد مغادرة شاشة الاختبار للمرة الأولى. تكرار المغادرة سيؤدي لإنهاء الاختبار وتسليمه فوراً.',
      };
    }

    // Flexible Resume Mode
    const now = new Date();
    const draftAnswers =
      cleanAnswers.length > 0 ? cleanAnswers : attempt.draftAnswers || [];

    const updated = await this.attemptModel.findOneAndUpdate(
      {
        _id: attempt._id,
        status: 'in_progress',
      },
      {
        $inc: { exitCount: 1 },
        $set: {
          draftAnswers,
          lastActiveAt: now,
        },
      },
      { new: true },
    );

    return {
      status: 'in_progress',
      exitCount: updated?.exitCount || (attempt.exitCount || 0) + 1,
      allowResume: true,
    };
  }

  /**
   * Submit quiz with automated grading and atomic state locking.
   */
  async submitQuiz(quizId: string, studentUserId: string, dto: SubmitQuizDto) {
    const studentUserObjectId = new Types.ObjectId(studentUserId);

    // Concurrently fetch quiz and student profile to reduce submission latency
    const [quiz, studentProfile] = await Promise.all([
      this.findOne(quizId),
      this.studentProfileModel.findOne({ userId: studentUserObjectId }).lean(),
    ]);

    if (!quiz.isPublished) {
      throw new ForbiddenException('هذا الاختبار غير متاح');
    }

    // Atomically lock active attempt to prevent submission race conditions
    const lockedAttempt = await this.attemptModel.findOneAndUpdate(
      {
        quizId: quiz._id,
        studentId: studentUserObjectId,
        status: 'in_progress',
      },
      {
        $set: {
          status: 'submitted',
          submittedAt: new Date(),
        },
      },
      { new: false },
    );

    if (!lockedAttempt) {
      // Prevent duplicate submissions in QuizSubmission if already locked or finished
      const existing = await this.submissionModel.findOne({
        quizId: new Types.ObjectId(quizId),
        studentId: studentUserObjectId,
      });
      if (existing) {
        throw new ConflictException('لقد قمت بتسليم هذا الاختبار مسبقاً');
      }
      throw new ForbiddenException(
        'لا توجد جلسة اختبار نشطة للتسليم أو تم إنهاؤها مسبقاً',
      );
    }

    const studentCode = studentProfile?.studentCode || 'N/A';
    const studentName =
      studentProfile?.fullName ||
      studentProfile?.fullNameEn ||
      studentProfile?.fullNameAr ||
      'Student';
    const studentNameAr =
      studentProfile?.fullNameAr || studentProfile?.fullName || 'طالب';

    const submittedMap = new Map(
      (dto.answers || []).map((a) => [a.questionId, a.selectedOptionIndex]),
    );

    let totalScore = 0;
    const gradedAnswers = (quiz.questions || []).map((question) => {
      const selectedIndex = submittedMap.get(question.id);
      const isCorrect =
        selectedIndex !== undefined &&
        Number(selectedIndex) === Number(question.correctOptionIndex);
      const pointsAwarded = isCorrect ? question.points || 1 : 0;
      totalScore += pointsAwarded;

      return {
        questionId: question.id,
        selectedOptionIndex: selectedIndex ?? -1,
        isCorrect,
        pointsAwarded,
      };
    });

    const totalMarks = quiz.totalMarks || 1;
    const percentage = Math.round((totalScore / totalMarks) * 100);
    const isPassed =
      totalScore >= (quiz.passingMarks || Math.round(totalMarks * 0.5));

    // The client-supplied startedAt is untrusted; prefer the server-recorded attempt start.
    const startedAt = lockedAttempt.startedAt
      ? new Date(lockedAttempt.startedAt)
      : dto.startedAt
        ? new Date(dto.startedAt)
        : new Date();
    const submittedAt = new Date();
    const durationSeconds = Math.max(
      0,
      Math.round((submittedAt.getTime() - startedAt.getTime()) / 1000),
    );

    const submission = new this.submissionModel({
      quizId: quiz._id,
      courseId: quiz.courseId,
      studentId: studentUserObjectId,
      studentCode,
      studentName,
      studentNameAr,
      answers: gradedAnswers,
      score: totalScore,
      totalMarks,
      percentage,
      isPassed,
      startedAt,
      submittedAt,
      durationSeconds,
    });

    try {
      await submission.save();
      this.metricsService?.updateActiveQuizAttempts(-1);
      this.metricsService?.recordQuizSubmission(isPassed);
      await this.attemptModel.updateOne(
        {
          quizId: quiz._id,
          studentId: studentUserObjectId,
          status: 'in_progress',
        },
        {
          $set: { status: 'completed', submittedAt },
        },
      );
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ConflictException('لقد قمت بتسليم هذا الاختبار مسبقاً');
      }
      // Submission was not persisted: unlock the attempt so the student can retry
      // instead of being stuck with a 'submitted' attempt that has no result.
      await this.attemptModel
        .updateOne(
          { _id: lockedAttempt._id, status: 'submitted' },
          { $set: { status: 'in_progress' }, $unset: { submittedAt: 1 } },
        )
        .catch(() => undefined);
      throw err;
    }

    return this.studentSubmissionView(quiz, {
      score: totalScore,
      totalMarks,
      percentage,
      isPassed,
      submittedAt,
      answers: gradedAnswers,
    });
  }

  private studentSubmissionView(
    quiz: QuizDocument,
    submission: Pick<
      QuizSubmission,
      | 'score'
      | 'totalMarks'
      | 'percentage'
      | 'isPassed'
      | 'submittedAt'
      | 'answers'
    >,
  ) {
    const { resultsAvailable: showScore, reviewAvailable } =
      getQuizReleaseState(quiz);
    return {
      message: showScore
        ? 'تم تسليم الاختبار وتصحيحه بنجاح'
        : 'تم تسليم إجابات الاختبار بنجاح، وستظهر النتيجة فور إعلانها من أستاذ المقرر',
      score: showScore ? submission.score : undefined,
      totalMarks: submission.totalMarks,
      percentage: showScore ? submission.percentage : undefined,
      isPassed: showScore ? submission.isPassed : undefined,
      publishResults: showScore,
      canReview: reviewAvailable,
      submittedAt: submission.submittedAt,
      answers: reviewAvailable ? submission.answers : undefined,
    };
  }

  private sanitizeQuiz(quiz: Quiz | QuizDocument) {
    const sanitizedQuestions = (quiz.questions || []).map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      options: q.options,
      points: q.points,
    }));

    return {
      _id: (quiz as any)._id,
      title: quiz.title,
      titleAr: quiz.titleAr,
      description: quiz.description,
      courseId: quiz.courseId,
      courseCode: quiz.courseCode,
      courseName: quiz.courseName,
      courseNameAr: quiz.courseNameAr,
      courseNameEn: quiz.courseNameEn,
      durationMinutes: quiz.durationMinutes,
      totalMarks: quiz.totalMarks,
      passingMarks: quiz.passingMarks,
      startsAt: quiz.startsAt,
      endsAt: quiz.endsAt,
      allowResume: Boolean(quiz.allowResume),
      questions: sanitizedQuestions,
    };
  }

  private async autoSubmitAttempt(
    quiz: QuizDocument,
    attempt: QuizAttemptDocument,
    studentUserId: string,
    forcedStatus:
      'submitted' | 'terminated_by_exit' | 'timed_out' = 'submitted',
  ) {
    const studentUserObjectId = new Types.ObjectId(studentUserId);
    attempt.status = forcedStatus;
    attempt.submittedAt = new Date();
    await attempt.save();

    const existing = await this.submissionModel.findOne({
      quizId: quiz._id,
      studentId: studentUserObjectId,
    });
    if (existing) return existing;

    const studentProfile = await this.studentProfileModel
      .findOne({ userId: studentUserObjectId })
      .lean();
    const studentCode = studentProfile?.studentCode || 'N/A';
    const studentName =
      studentProfile?.fullName ||
      studentProfile?.fullNameEn ||
      studentProfile?.fullNameAr ||
      'Student';
    const studentNameAr =
      studentProfile?.fullNameAr || studentProfile?.fullName || 'طالب';

    const submittedMap = new Map(
      (attempt.draftAnswers || []).map((a) => [
        a.questionId,
        a.selectedOptionIndex,
      ]),
    );

    let totalScore = 0;
    const gradedAnswers = (quiz.questions || []).map((question) => {
      const selectedIndex = submittedMap.get(question.id);
      const isCorrect =
        selectedIndex !== undefined &&
        Number(selectedIndex) === Number(question.correctOptionIndex);
      const pointsAwarded = isCorrect ? question.points || 1 : 0;
      totalScore += pointsAwarded;

      return {
        questionId: question.id,
        selectedOptionIndex: selectedIndex ?? -1,
        isCorrect,
        pointsAwarded,
      };
    });

    const totalMarks = quiz.totalMarks || 1;
    const percentage = Math.round((totalScore / totalMarks) * 100);
    const isPassed =
      totalScore >= (quiz.passingMarks || Math.round(totalMarks * 0.5));
    const startedAt = attempt.startedAt || new Date();
    const submittedAt = new Date();
    const durationSeconds = Math.max(
      0,
      Math.round((submittedAt.getTime() - startedAt.getTime()) / 1000),
    );

    const submission = new this.submissionModel({
      quizId: quiz._id,
      courseId: quiz.courseId,
      studentId: studentUserObjectId,
      studentCode,
      studentName,
      studentNameAr,
      answers: gradedAnswers,
      score: totalScore,
      totalMarks,
      percentage,
      isPassed,
      startedAt,
      submittedAt,
      durationSeconds,
    });

    try {
      return await submission.save();
    } catch (err: any) {
      if (err?.code === 11000) {
        return (await this.submissionModel.findOne({
          quizId: quiz._id,
          studentId: studentUserObjectId,
        }))!;
      }
      throw err;
    }
  }

  /**
   * Get quiz questions, student selected answers, and correct answers for review.
   * Only accessible if:
   * 1. allowReview !== false
   * 2. The quiz end window has passed (if endsAt is set)
   * 3. Student has submitted or completed an attempt
   */
  async getQuizReview(quizId: string, studentUserId: string) {
    const quiz = await this.findOne(quizId);
    if (!quiz) {
      throw new NotFoundException('الاختبار غير موجود');
    }

    const { reviewAvailable } = getQuizReleaseState(quiz);
    if (!reviewAvailable) {
      throw new ForbiddenException(
        'مراجعة أسئلة وإجابات هذا الاختبار غير مفعلة من قِبل المدرس',
      );
    }

    const studentUserObjectId = new Types.ObjectId(studentUserId);
    const submission = await this.submissionModel
      .findOne({
        quizId: quiz._id,
        studentId: studentUserObjectId,
      })
      .lean();

    if (!submission) {
      throw new ForbiddenException(
        'لم يتم العثور على تسليم مسجل لهذا الاختبار لمراجعته',
      );
    }

    const studentAnswersMap = new Map(
      (submission.answers || []).map((a) => [a.questionId, a]),
    );

    const questionsWithReview = (quiz.questions || []).map((q, idx) => {
      const studentAnswer = studentAnswersMap.get(q.id);
      const isSelected =
        studentAnswer !== undefined && studentAnswer.selectedOptionIndex !== -1;
      return {
        id: q.id,
        index: idx + 1,
        text: q.text,
        type: q.type,
        options: q.options || [],
        correctOptionIndex: q.correctOptionIndex,
        points: q.points,
        explanation: q.explanation || null,
        studentSelectedOptionIndex:
          studentAnswer !== undefined ? studentAnswer.selectedOptionIndex : -1,
        isAnswered: isSelected,
        isCorrect: studentAnswer ? studentAnswer.isCorrect : false,
        pointsAwarded: studentAnswer ? studentAnswer.pointsAwarded : 0,
      };
    });

    return {
      quiz: {
        id: String(quiz._id || quizId),
        title: quiz.title,
        titleAr: quiz.titleAr,
        courseCode: quiz.courseCode,
        courseName: quiz.courseName,
        courseNameAr: quiz.courseNameAr,
        courseNameEn: quiz.courseNameEn,
        totalMarks: quiz.totalMarks,
        passingMarks: quiz.passingMarks,
        endsAt: quiz.endsAt,
      },
      submission: {
        score: submission.score,
        totalMarks: submission.totalMarks,
        percentage: submission.percentage,
        isPassed: submission.isPassed,
        submittedAt: submission.submittedAt,
        durationSeconds: submission.durationSeconds,
      },
      questions: questionsWithReview,
    };
  }

  private async sendQuizNotification(
    quiz: QuizDocument,
    course: CourseDocument,
    senderId: string,
  ) {
    try {
      const courseNameAr = course.nameAr || course.name;
      const courseNameEn = course.nameEn || course.name;
      const targetLevel = course.level ? String(course.level) : undefined;
      const titleAr = 'اختبار جديد متاح';
      const titleEn = 'New Quiz Available';
      const bodyAr = `تم إتاحة اختبار جديد لمقرر ${courseNameAr} (${course.code}): ${quiz.title}`;
      const bodyEn = `A new quiz is available for ${courseNameEn} (${course.code}): ${quiz.title}`;

      await this.notificationsService.sendNotification(
        {
          targetType: targetLevel ? 'level' : 'all',
          targetLevel,
          title: `${titleAr} | ${titleEn}`,
          body: `${bodyAr}\n${bodyEn}`,
          meta: {
            type: 'quiz',
            quizId: String(quiz._id),
            courseId: String(course._id),
            titleAr,
            titleEn,
            bodyAr,
            bodyEn,
          },
        },
        String(senderId),
      );
    } catch (err) {
      console.error('Failed to send quiz notification:', err);
    }
  }
}
