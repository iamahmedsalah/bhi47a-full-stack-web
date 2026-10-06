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
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(CourseRegistration.name)
    private registrationModel: Model<CourseRegistrationDocument>,
    @InjectModel(StudentProfile.name)
    private studentProfileModel: Model<StudentProfileDocument>,
    private readonly notificationsService: NotificationsService,
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

    const quiz = new this.quizModel({
      ...dto,
      courseId: new Types.ObjectId(dto.courseId),
      courseCode: course.code,
      courseName: course.nameAr || course.name,
      creatorId: new Types.ObjectId(user._id),
      creatorName: user.name,
      totalMarks,
      passingMarks,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
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
          '_id title titleAr description courseId courseCode courseName creatorId creatorName isPublished durationMinutes totalMarks passingMarks startsAt endsAt allowReview questions.id createdAt updatedAt',
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.quizModel.countDocuments(filter),
    ]);

    // Attach submission count to each quiz
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

    if (dto.startsAt) updatePayload.startsAt = new Date(dto.startsAt);
    if (dto.endsAt) updatePayload.endsAt = new Date(dto.endsAt);

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

  // ─── Student Operations ───────────────────────────────────────────

  async getStudentQuizzes(studentUserId: string) {
    if (!Types.ObjectId.isValid(studentUserId)) return [];

    const studentUserObjectId = new Types.ObjectId(studentUserId);

    // 1. Find registered courses for current term
    const registrations = await this.registrationModel
      .find({
        studentId: studentUserObjectId,
        status: { $in: ['approved', 'registered', 'confirmed'] },
      })
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

    // 2. Find published quizzes for these courses with selective projection
    const quizzes = await this.quizModel
      .find({
        courseId: { $in: courseObjectIds },
        isPublished: true,
      })
      .select(
        '_id title titleAr description courseId courseCode courseName creatorName durationMinutes totalMarks passingMarks startsAt endsAt questions.id',
      )
      .sort({ createdAt: -1 })
      .lean();

    if (quizzes.length === 0) return [];

    // 3. Find student's submissions
    const quizIds = quizzes.map((q) => q._id);
    const submissions = await this.submissionModel
      .find({
        quizId: { $in: quizIds },
        studentId: studentUserObjectId,
      })
      .lean();

    const submissionsMap = new Map(
      submissions.map((s) => [s.quizId.toString(), s]),
    );

    const now = new Date();

    return quizzes.map((quiz) => {
      const submission = submissionsMap.get(quiz._id.toString());
      const isStarted = !quiz.startsAt || new Date(quiz.startsAt) <= now;
      const isEnded = quiz.endsAt && new Date(quiz.endsAt) < now;
      const isOpen = isStarted && !isEnded;

      return {
        _id: quiz._id,
        title: quiz.title,
        titleAr: quiz.titleAr,
        description: quiz.description,
        courseId: quiz.courseId,
        courseCode: quiz.courseCode,
        courseName: quiz.courseName,
        creatorName: quiz.creatorName,
        durationMinutes: quiz.durationMinutes,
        totalMarks: quiz.totalMarks,
        passingMarks: quiz.passingMarks,
        questionsCount: quiz.questions?.length || 0,
        startsAt: quiz.startsAt,
        endsAt: quiz.endsAt,
        isOpen,
        isEnded,
        isSubmitted: Boolean(submission),
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
    const quiz = await this.findOne(quizId);
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

    const studentUserObjectId = new Types.ObjectId(studentUserId);

    // Check if already submitted
    const existing = await this.submissionModel.findOne({
      quizId: new Types.ObjectId(quizId),
      studentId: studentUserObjectId,
    });
    if (existing) {
      throw new ConflictException('لقد قمت بتقديم هذا الاختبار بالفعل');
    }

    // Sanitize questions: strictly strip correctOptionIndex & explanation
    const sanitizedQuestions = (quiz.questions || []).map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      options: q.options,
      points: q.points,
    }));

    return {
      _id: quiz._id,
      title: quiz.title,
      titleAr: quiz.titleAr,
      description: quiz.description,
      courseId: quiz.courseId,
      courseCode: quiz.courseCode,
      courseName: quiz.courseName,
      durationMinutes: quiz.durationMinutes,
      totalMarks: quiz.totalMarks,
      passingMarks: quiz.passingMarks,
      questions: sanitizedQuestions,
    };
  }

  async submitQuiz(quizId: string, studentUserId: string, dto: SubmitQuizDto) {
    const quiz = await this.findOne(quizId);
    if (!quiz.isPublished) {
      throw new ForbiddenException('هذا الاختبار غير متاح');
    }

    const studentUserObjectId = new Types.ObjectId(studentUserId);

    // Prevent duplicate submission
    const existing = await this.submissionModel.findOne({
      quizId: new Types.ObjectId(quizId),
      studentId: studentUserObjectId,
    });
    if (existing) {
      throw new ConflictException('لقد قمت بتسليم هذا الاختبار مسبقاً');
    }

    // Fetch student info
    const studentProfile = await this.studentProfileModel
      .findOne({ userId: studentUserObjectId })
      .lean();

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
      quizId: new Types.ObjectId(quizId),
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
