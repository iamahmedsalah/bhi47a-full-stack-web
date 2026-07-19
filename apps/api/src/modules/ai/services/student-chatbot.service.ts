import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GeminiProvider } from '../providers/gemini.provider';
import { RagService } from './rag.service';
import {
  ChatSession,
  ChatSessionDocument,
} from '../schemas/chat-session.schema';
import {
  AiUsageLog,
  AiUsageLogDocument,
} from '../schemas/ai-usage-log.schema';
import { Grade } from '../../grades/schemas/grade.schema';
import { StudentProfile } from '../../students/schemas/student-profile.schema';
import { StudentAcademicProfile } from '../../registrations/schemas/student-academic-profile.schema';
import type { LlmChatMessage } from '../providers/llm-provider.interface';

const MAX_HISTORY_MESSAGES = 20;
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
- Keep responses under 500 words unless the student asks for detail`;

@Injectable()
export class StudentChatbotService {
  constructor(
    private readonly gemini: GeminiProvider,
    private readonly rag: RagService,
    @InjectModel(ChatSession.name)
    private readonly sessions: Model<ChatSessionDocument>,
    @InjectModel(AiUsageLog.name)
    private readonly usageLogs: Model<AiUsageLogDocument>,
    @InjectModel(Grade.name) private readonly grades: Model<Grade>,
    @InjectModel(StudentProfile.name)
    private readonly profiles: Model<StudentProfile>,
    @InjectModel(StudentAcademicProfile.name)
    private readonly academics: Model<StudentAcademicProfile>,
  ) {}

  async chat(
    studentId: string,
    message: string,
    sessionId?: string,
  ) {
    const start = Date.now();
    const userId = new Types.ObjectId(studentId);

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
    });

    // Get student academic data for personalized responses
    const studentContext = await this.buildStudentContext(userId);

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
        message: response.content,
        usage: response.usage,
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
        message:
          'عذراً، حدث خطأ أثناء معالجة رسالتك. يرجى المحاولة مرة أخرى لاحقاً.',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
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

  private async buildStudentContext(userId: Types.ObjectId): Promise<string> {
    const [profile, academic] = await Promise.all([
      this.profiles.findOne({ userId }).lean(),
      this.academics.findOne({ studentId: userId }).lean(),
    ]);

    if (!profile && !academic) return '';

    const parts: string[] = [];
    if (profile) {
      parts.push(
        `Department: ${profile.department ?? 'N/A'}`,
        `Level: ${profile.level ?? 'N/A'}`,
        `Enrollment: ${profile.enrollmentStatus ?? 'N/A'}`,
      );
    }
    if (academic) {
      parts.push(
        `GPA: ${academic.gpa ?? 'N/A'}`,
        `Academic Level: ${academic.academicLevel ?? 'N/A'}`,
        `Completed Courses: ${academic.completedCourses?.length ?? 0}`,
        `Failed Courses: ${academic.failedCourses?.length ?? 0}`,
        `Academic Warnings: ${academic.academicWarnings ?? 0}`,
      );
    }

    return parts.join('\n');
  }
}
