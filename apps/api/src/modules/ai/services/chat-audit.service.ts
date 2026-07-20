import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import {
  ChatSession,
  ChatSessionDocument,
} from '../schemas/chat-session.schema';
import { QueryChatAuditDto } from '../dto/query-chat-audit.dto';

interface ChatAuditAggregateResult {
  items: Array<{
    _id: Types.ObjectId;
    sessionType: string;
    isActive: boolean;
    lastMessageAt?: Date;
    createdAt: Date;
    updatedAt: Date;
    totalTokens: number;
    messageCount: number;
    lastMessage?: { role: string; content: string; timestamp: Date };
    student: { _id: Types.ObjectId; name: string; studentCode?: string };
  }>;
  total: Array<{ count: number }>;
}

@Injectable()
export class ChatAuditService {
  constructor(
    @InjectModel(ChatSession.name)
    private readonly sessions: Model<ChatSessionDocument>,
  ) {}

  async list(query: QueryChatAuditDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const search = query.search?.trim();
    const studentMatch: Record<string, unknown> = { 'student.role': 'student' };

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      studentMatch.$or = [
        { 'student.name': { $regex: escaped, $options: 'i' } },
        { 'student.studentCode': { $regex: escaped, $options: 'i' } },
      ];
    }

    const pipeline: PipelineStage[] = [
      { $match: { sessionType: { $in: ['student-faq', 'student-academic'] } } },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'student',
        },
      },
      { $unwind: '$student' },
      { $match: studentMatch },
      { $sort: { lastMessageAt: -1, createdAt: -1 } },
      {
        $facet: {
          items: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                sessionType: 1,
                isActive: 1,
                lastMessageAt: 1,
                createdAt: 1,
                updatedAt: 1,
                totalTokens: 1,
                messageCount: { $size: { $ifNull: ['$messages', []] } },
                lastMessage: { $arrayElemAt: ['$messages', -1] },
                student: {
                  _id: '$student._id',
                  name: '$student.name',
                  studentCode: '$student.studentCode',
                },
              },
            },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ];

    const [result] = await this.sessions
      .aggregate<ChatAuditAggregateResult>(pipeline)
      .exec();
    const total = result?.total[0]?.count ?? 0;

    return {
      items: result?.items ?? [],
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getSession(sessionId: string) {
    const [session] = await this.sessions.aggregate([
      { $match: { _id: new Types.ObjectId(sessionId) } },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'student',
        },
      },
      { $unwind: '$student' },
      { $match: { 'student.role': 'student' } },
      {
        $project: {
          sessionType: 1,
          isActive: 1,
          lastMessageAt: 1,
          createdAt: 1,
          updatedAt: 1,
          totalTokens: 1,
          messages: 1,
          student: {
            _id: '$student._id',
            name: '$student.name',
            studentCode: '$student.studentCode',
          },
        },
      },
    ]);

    if (!session) throw new NotFoundException('Chat session not found');
    return session;
  }
}
