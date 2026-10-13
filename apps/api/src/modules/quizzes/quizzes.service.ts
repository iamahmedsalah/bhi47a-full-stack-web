import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
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
import { PERMISSIONS } from '@student-portal/shared';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import { NotificationsService } from '../notifications/notifications.service';
import { QuizQuestionExcelService } from './services/quiz-question-excel.service';

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
  isPublished: boolean;
  submissionsCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

@Injectable()
export class QuizzesService {
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
  ) {}

  // ─── Staff / Admin Management ─────────────────────────────────────

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

    // Permission check: admin OR course doctor OR has QUIZZES_WRITE
    if (user.role === 'staff') {
      const isCourseDoctor =
        course.doctorId && course.doctorId.toString() === user._id.toString();
      const hasWritePerm = user.permissions?.includes(
        PERMISSIONS.QUIZZES_WRITE,
      );
      if (!isCourseDoctor && !hasWritePerm) {
        throw new ForbiddenException(
          'غير مصرح لك بإنشاء اختبار لهذا المقرر (يجب أن تكون أستاذ المقرر أو تمتلك صلاحية)',
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
    });

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

    // If staff without full permissions, restrict to assigned courses or created quizzes
    if (
      user.role === 'staff' &&
      !user.permissions?.includes(PERMISSIONS.QUIZZES_WRITE)
    ) {
      const assignedCourses = await this.courseModel
        .find({ doctorId: new Types.ObjectId(user._id) })
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
          '_id title titleAr description courseId courseCode courseName creatorId creatorName isPublished durationMinutes totalMarks passingMarks startsAt endsAt allowReview allowResume questions.id createdAt updatedAt',
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.quizModel.countDocuments(filter),
    ]);

    const quizIds = items.map((q) => q._id);
    const counts = await this.submissionModel.aggregate([
      { $match: { quizId: { $in: quizIds } } },
      { $group: { _id: '$quizId', count: { $sum: 1 } } },
    ]);
    const countsMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

    const decorated = items.map((q) => ({
      ...q,
      submissionsCount: countsMap.get(q._id.toString()) || 0,
    }));

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

  async update(
    id: string,
    user: AuthenticatedUser,
    dto: UpdateQuizDto,
  ): Promise<QuizDocument> {
    const quiz = await this.findOne(id);

    // Permission check
    if (user.role === 'staff') {
      const isCreator = quiz.creatorId.toString() === user._id.toString();
      const hasWritePerm = user.permissions?.includes(
        PERMISSIONS.QUIZZES_WRITE,
      );
      if (!isCreator && !hasWritePerm) {
        throw new ForbiddenException('غير مصرح لك بتعديل هذا الاختبار');
      }
    }

    const updatePayload: Record<string, any> = { ...dto };
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

    if (startsAtVal !== undefined) {
      updatePayload.startsAt = startsAtVal ? new Date(startsAtVal) : undefined;
    }
    if (endsAtVal !== undefined) {
      updatePayload.endsAt = endsAtVal ? new Date(endsAtVal) : undefined;
    }
    if (dto.allowResume !== undefined) {
      updatePayload.allowResume = Boolean(dto.allowResume);
    }

    const effectiveStartsAt =
      updatePayload.startsAt !== undefined
        ? updatePayload.startsAt
        : quiz.startsAt;
    const effectiveEndsAt =
      updatePayload.endsAt !== undefined ? updatePayload.endsAt : quiz.endsAt;
    const effectiveDuration =
      updatePayload.durationMinutes !== undefined
        ? Number(updatePayload.durationMinutes)
        : quiz.durationMinutes;

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
      const isCreator = quiz.creatorId.toString() === user._id.toString();
      const hasWritePerm = user.permissions?.includes(
        PERMISSIONS.QUIZZES_WRITE,
      );
      if (!isCreator && !hasWritePerm) {
        throw new ForbiddenException('غير مصرح لك بحذف هذا الاختبار');
      }
    }

    await Promise.all([
      this.quizModel.findByIdAndDelete(id),
      this.submissionModel.deleteMany({ quizId: new Types.ObjectId(id) }),
      this.attemptModel.deleteMany({ quizId: new Types.ObjectId(id) }),
    ]);

    return { message: 'تم حذف الاختبار وسجلاته بنجاح' };
  }

  async getSubmissions(quizId: string, _user: AuthenticatedUser) {
    await this.findOne(quizId);
    return this.submissionModel
      .find({ quizId: new Types.ObjectId(quizId) })
      .sort({ submittedAt: -1 })
      .lean();
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

    const registeredCourses = await this.courseModel
      .find({
        $or: [
          { code: { $in: Array.from(registeredCodes) } },
          {
            _id: {
              $in: Array.from(registeredCodes)
                .filter((code) => Types.ObjectId.isValid(code))
                .map((id) => new Types.ObjectId(id)),
            },
          },
        ],
        isActive: true,
      })
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
        '_id title titleAr description courseId courseCode courseName courseNameAr courseNameEn creatorName durationMinutes totalMarks passingMarks startsAt endsAt allowResume allowReview questions.id',
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
      const endsAtMs = quiz.endsAt ? new Date(quiz.endsAt).getTime() : 0;
      const isStarted = !startsAtMs || startsAtMs <= nowMs;
      const isEnded = Boolean(endsAtMs && endsAtMs < nowMs);
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
        isOpen,
        isEnded,
        isSubmitted: Boolean(submission),
        attemptStatus: attempt?.status,
        submission: submission
          ? {
              score: submission.score,
              totalMarks: submission.totalMarks,
              percentage: submission.percentage,
              isPassed: submission.isPassed,
              submittedAt: submission.submittedAt,
              durationSeconds: submission.durationSeconds,
            }
          : undefined,
      };
    });
  }

  async getQuizForTaking(quizId: string, studentUserId: string) {
    const studentUserObjectId = new Types.ObjectId(studentUserId);

    const [quiz, existing] = await Promise.all([
      this.findOne(quizId),
      this.submissionModel.findOne({
        quizId: new Types.ObjectId(quizId),
        studentId: studentUserObjectId,
      }),
    ]);

    if (!quiz.isPublished) {
      throw new ForbiddenException('هذا الاختبار غير متاح حالياً');
    }

    const now = new Date();
    if (quiz.startsAt && new Date(quiz.startsAt) > now) {
      throw new ForbiddenException('لم يبدأ موعد الاختبار بعد');
    }
    if (quiz.endsAt && new Date(quiz.endsAt) < now) {
      throw new ForbiddenException('انتهى موعد تقديم الاختبار');
    }

    // Check if already submitted
    if (existing) {
      throw new ConflictException('لقد قمت بتقديم هذا الاختبار بالفعل');
    }

    return this.sanitizeQuiz(quiz);
  }

  /**
   * Start / resume quiz attempt with server-enforced countdown timer and anti-cheat session security.
   */
  async startQuizAttempt(quizId: string, studentUserId: string) {
    const quiz = await this.findOne(quizId);
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

    const studentUserObjectId = new Types.ObjectId(studentUserId);

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
        if (quiz.allowResume === false) {
          // Strict anti-cheat: Disconnect or exit lock
          attempt.status = 'terminated_by_exit';
          await attempt.save();
          await this.autoSubmitAttempt(
            quiz,
            attempt,
            studentUserId,
            'terminated_by_exit',
          );
          throw new ForbiddenException(
            'تم إنهاء محاولة هذا الاختبار بسبب مغادرة الصفحة ولا يمكن استئنافه (وضع الاختبار المشدد)',
          );
        }

        // Resume mode: calculate server-side remaining time
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

        return {
          quiz: this.sanitizeQuiz(quiz),
          attemptId: attempt._id,
          startedAt: attempt.startedAt,
          expiresAt: attempt.expiresAt,
          remainingSeconds: remSec,
          allowResume: true,
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
      // Strict Anti-Cheat Mode: Auto-submit immediate payload and terminate attempt
      const submission = await this.autoSubmitAttempt(
        quiz,
        attempt,
        studentUserId,
        'terminated_by_exit',
      );

      return {
        status: 'terminated_by_exit',
        message:
          'تم إنهاء الاختبار وتسليمه بسبب مغادرة الصفحة أو تبديل التبويب',
        submission,
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
    await this.attemptModel.findOneAndUpdate(
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
    );

    // Prevent duplicate submissions in QuizSubmission
    const existing = await this.submissionModel.findOne({
      quizId: new Types.ObjectId(quizId),
      studentId: studentUserObjectId,
    });
    if (existing) {
      throw new ConflictException('لقد قمت بتسليم هذا الاختبار مسبقاً');
    }

    const studentCode = studentProfile?.studentCode || 'N/A';
    const studentName =
      studentProfile?.fullName || studentProfile?.fullNameAr || 'طالب';

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

    const startedAt = dto.startedAt ? new Date(dto.startedAt) : new Date();
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
      throw err;
    }

    return {
      message: 'تم تسليم الاختبار وتصحيحه بنجاح',
      score: totalScore,
      totalMarks,
      percentage,
      isPassed,
      submittedAt,
      answers: quiz.allowReview ? gradedAnswers : undefined,
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
      studentProfile?.fullName || studentProfile?.fullNameAr || 'طالب';

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

    if (quiz.allowReview === false) {
      throw new ForbiddenException(
        'مراجعة أسئلة وإجابات هذا الاختبار غير مفعلة من قِبل المدرس',
      );
    }

    const now = new Date();
    if (quiz.endsAt && new Date(quiz.endsAt) > now) {
      throw new ForbiddenException(
        'لا يمكن مراجعة الإجابات النموذجية قبل انتهاء الفترة الزمنية المحددة للاختبار',
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
