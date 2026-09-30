import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GeminiProvider } from '../providers/gemini.provider';
import { AiUsageLog, AiUsageLogDocument } from '../schemas/ai-usage-log.schema';
import { User } from '../../users/schemas/user.schema';
import { Grade } from '../../grades/schemas/grade.schema';
import { Course } from '../../courses/schemas/course.schema';
import { StudentAcademicProfile } from '../../registrations/schemas/student-academic-profile.schema';
import { StudentProfile } from '../../students/schemas/student-profile.schema';

const ADMIN_SYSTEM_PROMPT = `You are an AI academic advisor assistant for university staff and administrators.
You analyze student academic data and provide actionable insights.

Rules:
- Be data-driven and precise
- Cite specific numbers (GPA, course counts, warning counts)
- Answer in the same language as the request (Arabic or English)
- Suggest concrete actions (courses to recommend, students at risk)
- Flag concerning patterns (declining GPA, repeated failures, high warning counts)
- Never fabricate data — only use what is provided in the student context
- Keep analysis under 800 words unless asked for more detail`;

@Injectable()
export class AdminAiAdvisorService {
  constructor(
    private readonly gemini: GeminiProvider,
    @InjectModel(AiUsageLog.name)
    private readonly usageLogs: Model<AiUsageLogDocument>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Grade.name) private readonly grades: Model<Grade>,
    @InjectModel(Course.name) private readonly courses: Model<Course>,
    @InjectModel(StudentAcademicProfile.name)
    private readonly academics: Model<StudentAcademicProfile>,
    @InjectModel(StudentProfile.name)
    private readonly profiles: Model<StudentProfile>,
  ) {}

  /**
   * Analyze a single student's academic performance and provide
   * actionable recommendations for the advisor.
   */
  async analyzeStudent(studentId: string, actorId: string) {
    const start = Date.now();
    const studentContext = await this.buildStudentAnalysis(studentId);

    if (!studentContext) {
      return {
        analysis: 'لم يتم العثور على بيانات أكاديمية لهذا الطالب.',
        recommendations: [],
      };
    }

    try {
      const response = await this.gemini.chat(
        `Analyze this student's academic performance and provide specific recommendations:\n\n${studentContext}`,
        {
          systemInstruction: ADMIN_SYSTEM_PROMPT,
          temperature: 0.5,
          maxOutputTokens: 1500,
        },
      );

      await this.usageLogs.create({
        userId: new Types.ObjectId(actorId),
        model: response.model,
        feature: 'admin-student-analysis',
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
        latencyMs: Date.now() - start,
      });

      return {
        analysis: response.content,
        usage: response.usage,
      };
    } catch (error) {
      await this.usageLogs.create({
        userId: new Types.ObjectId(actorId),
        model: 'gemini',
        feature: 'admin-student-analysis',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        analysis: 'حدث خطأ أثناء تحليل بيانات الطالب. يرجى المحاولة مرة أخرى.',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }
  }

  /**
   * Summarize a student's academic history for advisor notes.
   */
  async summarizeStudent(studentId: string, actorId: string) {
    const start = Date.now();
    const context = await this.buildStudentAnalysis(studentId);

    if (!context) {
      return { summary: 'لا توجد بيانات كافية لإنشاء ملخص.' };
    }

    try {
      const response = await this.gemini.chat(
        `Write a concise academic summary for this student that an advisor can use during an advising session:\n\n${context}`,
        {
          systemInstruction: ADMIN_SYSTEM_PROMPT,
          temperature: 0.3,
          maxOutputTokens: 800,
        },
      );

      await this.usageLogs.create({
        userId: new Types.ObjectId(actorId),
        model: response.model,
        feature: 'admin-student-summary',
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
        latencyMs: Date.now() - start,
      });

      return { summary: response.content, usage: response.usage };
    } catch (error) {
      await this.usageLogs.create({
        userId: new Types.ObjectId(actorId),
        model: 'gemini',
        feature: 'admin-student-summary',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return { summary: 'حدث خطأ أثناء إنشاء الملخص.' };
    }
  }

  /**
   * Get AI usage statistics for admin dashboard.
   */
  async getUsageStats(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const stats = await this.usageLogs.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: '$feature',
          totalRequests: { $sum: 1 },
          totalTokens: { $sum: '$totalTokens' },
          avgLatencyMs: { $avg: '$latencyMs' },
          errorCount: {
            $sum: { $cond: [{ $ne: ['$error', null] }, 1, 0] },
          },
        },
      },
    ]);

    return {
      period: `${days} days`,
      features: stats,
      totalRequests: stats.reduce((sum, s) => sum + s.totalRequests, 0),
      totalTokens: stats.reduce((sum, s) => sum + s.totalTokens, 0),
    };
  }

  private async buildStudentAnalysis(
    studentId: string,
  ): Promise<string | null> {
    const id = new Types.ObjectId(studentId);
    const [user, profile, academic, publishedGrades] = await Promise.all([
      this.users.findById(id).select('name studentCode').lean(),
      this.profiles.findOne({ userId: id }).lean(),
      this.academics.findOne({ studentId: id }).lean(),
      this.grades
        .find({ studentId: id, isPublished: true })
        .select(
          'courseCode examType grade maxGrade status academicYear semester',
        )
        .sort({ academicYear: -1, semester: -1 })
        .lean(),
    ]);

    if (!user || !academic) return null;

    const parts = [
      `## Student: ${user.name} (${user.studentCode})`,
      `Department: ${profile?.department ?? 'N/A'}`,
      `Level: ${profile?.level ?? academic.academicLevel ?? 'N/A'}`,
      `GPA: ${academic.gpa ?? 'N/A'}`,
      `Academic Warnings: ${academic.academicWarnings ?? 0}`,
      `Completed Courses (${academic.completedCourses?.length ?? 0}): ${(academic.completedCourses ?? []).join(', ') || 'None'}`,
      `Failed Courses (${academic.failedCourses?.length ?? 0}): ${(academic.failedCourses ?? []).join(', ') || 'None'}`,
      `Low Grade Courses: ${(academic.lowGradeCourses ?? []).join(', ') || 'None'}`,
      `Graduating This Year: ${academic.isGraduatingThisYear ? 'Yes' : 'No'}`,
    ];

    if (publishedGrades.length > 0) {
      parts.push('\n## Recent Grades');
      const gradesByTerm = new Map<string, typeof publishedGrades>();
      for (const g of publishedGrades) {
        const key = `${g.academicYear} - ${g.semester}`;
        const list = gradesByTerm.get(key) ?? [];
        list.push(g);
        gradesByTerm.set(key, list);
      }

      for (const [term, grades] of gradesByTerm) {
        parts.push(`\n### ${term}`);
        for (const g of grades) {
          parts.push(
            `- ${g.courseCode} (${g.examType}): ${g.grade}/${g.maxGrade} [${g.status}]`,
          );
        }
      }
    }

    return parts.join('\n');
  }
}
