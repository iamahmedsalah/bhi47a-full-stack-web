import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GeminiProvider } from '../providers/gemini.provider';
import { RagService } from './rag.service';
import {
  ChatSession,
  ChatSessionDocument,
} from '../schemas/chat-session.schema';
import { AiUsageLog, AiUsageLogDocument } from '../schemas/ai-usage-log.schema';
import { Grade } from '../../grades/schemas/grade.schema';
import { StudentProfile } from '../../students/schemas/student-profile.schema';
import { StudentAcademicProfile } from '../../registrations/schemas/student-academic-profile.schema';
import { Course, CourseDocument } from '../../courses/schemas/course.schema';
import { RulesBasedRecommendationProvider } from '../../registrations/recommendations/rules-based-recommendation.provider';
import type { LlmChatMessage } from '../providers/llm-provider.interface';
import { MongoRateLimiterStore } from '../../../common/rate-limit/mongo-rate-limiter.store';
import { AiSettingsService } from './ai-settings.service';

const MAX_HISTORY_MESSAGES = 20;
const STUDENT_CHAT_LIMIT = 5;
const STUDENT_CHAT_WINDOW_MS = 12 * 60 * 60 * 1000;
const STUDENT_SYSTEM_PROMPT = `You are an intelligent academic assistant for a university student portal.
You help students with:
1. Answering frequently asked questions about the institute
2. Providing course information (prerequisites, credit hours, levels)
3. Explaining grades and academic standing
4. Guiding students through registration and complaint processes
5. General academic advising

Rules:
- Be concise and helpful
- Answer in the same language as the student's message (Arabic or English)
- If you don't know something, say so honestly and suggest contacting student affairs
- Never make up information about grades, courses, or policies
- Use the provided context (FAQs, courses, student data) to give accurate answers
- When naming courses, show the localized course name and do not show its course code unless the student explicitly asks for codes
- Keep responses under 500 words unless the student asks for detail`;

@Injectable()
export class StudentChatbotService {
  private readonly recommendationProvider =
    new RulesBasedRecommendationProvider();
  private readonly rateLimiter = new MongoRateLimiterStore();

  constructor(
    private readonly gemini: GeminiProvider,
    private readonly rag: RagService,
    private readonly aiSettings: AiSettingsService,
    @InjectModel(ChatSession.name)
    private readonly sessions: Model<ChatSessionDocument>,
    @InjectModel(AiUsageLog.name)
    private readonly usageLogs: Model<AiUsageLogDocument>,
    @InjectModel(Grade.name) private readonly grades: Model<Grade>,
    @InjectModel(StudentProfile.name)
    private readonly profiles: Model<StudentProfile>,
    @InjectModel(StudentAcademicProfile.name)
    private readonly academics: Model<StudentAcademicProfile>,
    @InjectModel(Course.name) private readonly courses: Model<CourseDocument>,
  ) {}

  async chat(
    studentId: string,
    message: string,
    sessionId?: string,
    requestedLocale?: 'ar' | 'en',
  ) {
    if (!(await this.aiSettings.isStudentAdvisorEnabled())) {
      throw new ServiceUnavailableException({
        message:
          requestedLocale === 'ar'
            ? 'المساعد الأكاديمي الذكي متوقف مؤقتًا بواسطة الإدارة.'
            : 'The academic AI advisor is temporarily disabled by the administration.',
        errors: { code: 'AI_ADVISOR_DISABLED' },
      });
    }

    const start = Date.now();
    const userId = new Types.ObjectId(studentId);
    const locale = requestedLocale ?? (/[؀-ۿ]/.test(message) ? 'ar' : 'en');
    const rateLimit = await this.rateLimiter.increment(
      `student-chat:${studentId}`,
      STUDENT_CHAT_WINDOW_MS,
      STUDENT_CHAT_LIMIT,
    );

    if (rateLimit.count > STUDENT_CHAT_LIMIT) {
      const messageText =
        locale === 'ar'
          ? 'لقد استخدمت رسائلك الخمس المتاحة. يمكنك استخدام المساعد مرة أخرى بعد انتهاء فترة 12 ساعة.'
          : 'You have used your 5 available messages. You can use the assistant again after the 12-hour window resets.';
      throw new HttpException(
        {
          message: messageText,
          errors: {
            code: 'STUDENT_CHAT_LIMIT_EXCEEDED',
            limit: STUDENT_CHAT_LIMIT,
            remaining: 0,
            resetAt: new Date(rateLimit.resetAt).toISOString(),
            retryAfterSeconds: rateLimit.retryAfterSeconds,
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Get or create session
    let session = sessionId
      ? await this.sessions.findOne({
          _id: sessionId,
          userId,
          isActive: true,
        })
      : null;

    if (!session) {
      session = await this.sessions.create({
        userId,
        sessionType: 'student-faq',
        messages: [],
        isActive: true,
        totalTokens: 0,
      });
    }

    // Build context from RAG
    const context = await this.rag.buildContext(message, {
      includeFaqs: true,
      includeCourses: true,
      locale,
    });

    // Get student academic data for personalized responses
    const studentContext = await this.buildStudentContext(userId, locale);

    // Build system prompt with context
    const systemInstruction = [
      STUDENT_SYSTEM_PROMPT,
      studentContext ? `\n## Student Profile\n${studentContext}` : '',
      context ? `\n## Retrieved Context\n${context}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // Convert session history to LLM format
    const history: LlmChatMessage[] = session.messages
      .slice(-MAX_HISTORY_MESSAGES)
      .map((msg) => ({
        role: msg.role as 'user' | 'model',
        content: msg.content,
      }));

    try {
      const response = await this.gemini.chat(message, {
        systemInstruction,
        history,
        temperature: 0.7,
        maxOutputTokens: 1024,
      });

      // Save messages to session
      session.messages.push(
        { role: 'user', content: message, timestamp: new Date() },
        { role: 'model', content: response.content, timestamp: new Date() },
      );
      session.lastMessageAt = new Date();
      session.totalTokens += response.usage.totalTokens;
      await session.save();

      // Log usage
      await this.usageLogs.create({
        userId,
        model: response.model,
        feature: 'student-chatbot',
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
        latencyMs: Date.now() - start,
      });

      return {
        sessionId: session._id.toString(),
        answer: response.content,
        message: response.content,
        rateLimit: {
          limit: STUDENT_CHAT_LIMIT,
          remaining: rateLimit.remaining,
          resetAt: new Date(rateLimit.resetAt).toISOString(),
        },
      };
    } catch (error) {
      // Log failed requests
      await this.usageLogs.create({
        userId,
        model: 'gemini',
        feature: 'student-chatbot',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        sessionId: session._id.toString(),
        answer: /[\u0600-\u06ff]/.test(message)
          ? 'عذرًا، تعذر معالجة رسالتك الآن. يرجى المحاولة مرة أخرى لاحقًا.'
          : 'Sorry, I could not process your message right now. Please try again later.',
        rateLimit: {
          limit: STUDENT_CHAT_LIMIT,
          remaining: rateLimit.remaining,
          resetAt: new Date(rateLimit.resetAt).toISOString(),
        },
      };
    }
  }

  async getSessionHistory(studentId: string, sessionId: string) {
    const session = await this.sessions.findOne({
      _id: sessionId,
      userId: new Types.ObjectId(studentId),
    });
    return session?.messages ?? [];
  }

  async listSessions(studentId: string) {
    return this.sessions
      .find({
        userId: new Types.ObjectId(studentId),
      })
      .select('sessionType isActive lastMessageAt createdAt totalTokens')
      .sort({ lastMessageAt: -1 })
      .limit(20)
      .lean();
  }

  async endSession(studentId: string, sessionId: string) {
    await this.sessions.findOneAndUpdate(
      { _id: sessionId, userId: new Types.ObjectId(studentId) },
      { isActive: false },
    );
  }

  private async buildStudentContext(
    userId: Types.ObjectId,
    locale: 'ar' | 'en',
  ): Promise<string> {
    const [profile, academic, publishedGrades, allCourses] = await Promise.all([
      this.profiles.findOne({ userId }).lean(),
      this.academics.findOne({ studentId: userId }).lean(),
      this.grades
        .find({ studentId: userId, isPublished: true })
        .select('courseCode examType grade maxGrade semester academicYear')
        .sort({ _id: -1 })
        .limit(500)
        .lean(),
      this.courses
        .find({})
        .select('code name nameAr nameEn creditHours isActive')
        .lean(),
    ]);

    if (!profile && !academic) return '';

    const parts: string[] = [];
    const courseByCode = new Map(
      allCourses.map((course) => [course.code.trim().toUpperCase(), course]),
    );
    const courseName = (code: string) => {
      const course = courseByCode.get(code.trim().toUpperCase());
      if (!course) return code;
      return locale === 'ar'
        ? course.nameAr || course.name || course.nameEn || code
        : course.nameEn || course.name || course.nameAr || code;
    };
    if (profile) {
      parts.push(
        `Department: ${profile.department ?? 'N/A'}`,
        `Level: ${profile.level ?? 'N/A'}`,
        `Enrollment: ${profile.enrollmentStatus ?? 'N/A'}`,
      );
    }
    if (academic) {
      const courses = allCourses.filter((course) => course.isActive);
      const completed = new Set(
        academic.completedCourses.map((code) => code.trim().toUpperCase()),
      );
      const completedCredits = courses.reduce(
        (total, course) =>
          completed.has(course.code.trim().toUpperCase())
            ? total + (course.creditHours ?? 0)
            : total,
        0,
      );
      const recommendedCourses = this.recommendationProvider
        .generate({
          courses,
          completedCourses: academic.completedCourses,
          failedCourses: academic.failedCourses,
          academicLevel: academic.academicLevel,
          semester: academic.semester,
          maxCreditHours: 18,
          academicWarningCount: academic.academicWarnings,
        })
        .filter((recommendation) => recommendation.isRecommendedForSemester)
        .map((recommendation) => courseName(recommendation.courseCode));

      parts.push(
        `GPA: ${academic.gpa ?? 'N/A'}`,
        `Academic Level: ${academic.academicLevel ?? 'N/A'}`,
        `Completed Courses: ${academic.completedCourses?.length ?? 0}`,
        `Completed Credits: ${completedCredits}`,
        `Failed Courses: ${academic.failedCourses?.length ?? 0}`,
        `Academic Warnings: ${academic.academicWarnings ?? 0}`,
        `Recommended Courses for Next Registration: ${recommendedCourses.join(', ') || 'None currently eligible'}`,
      );
    }

    if (publishedGrades.length > 0) {
      parts.push(
        `Recent Published Grades:\n${publishedGrades
          .map(
            (grade) =>
              `${grade.academicYear} ${grade.semester} — ${courseName(grade.courseCode)} ${grade.examType}: ${grade.grade}/${grade.maxGrade}`,
          )
          .join('\n')}`,
      );
    }

    return parts.join('\n');
  }
}
