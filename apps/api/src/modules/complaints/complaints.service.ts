import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Complaint, ComplaintDocument } from './schemas/complaint.schema';
import {
  SystemSettings,
  SystemSettingsDocument,
} from './schemas/system-settings.schema';
import {
  CreateComplaintDto,
  ComplaintDepartment,
  ComplaintType,
  PublicCreateComplaintDto,
  ReplyComplaintDto,
  UpdateComplaintStatusDto,
  UpdateSystemSettingsDto,
  QueryComplaintDto,
} from './dto/complaint.dto';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  buildPaginationOptions,
  createPaginatedResult,
} from '../../common/utils/pagination.util';
import { normalizeSearchTerm } from '../../common/utils/search.util';
import { AppLoggerService } from '../../core/logger/logger.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class ComplaintsService {
  constructor(
    @InjectModel(Complaint.name)
    private complaintModel: Model<ComplaintDocument>,
    @InjectModel(SystemSettings.name)
    private settingsModel: Model<SystemSettingsDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private logger: AppLoggerService,
    private notificationsService: NotificationsService,
  ) {}

  // Resolves settings singleton, creates if not exists
  async getSettings(): Promise<SystemSettingsDocument> {
    let settings = await this.settingsModel.findOne();
    if (!settings) {
      settings = new this.settingsModel({
        complaintsSystemOpen: true,
        blacklistedStudentCodes: [],
      });
      await settings.save();
    }
    return settings;
  }

  async updateSettings(
    dto: UpdateSystemSettingsDto,
    adminId: string,
  ): Promise<SystemSettingsDocument> {
    let settings = await this.settingsModel.findOne();
    if (!settings) {
      settings = new this.settingsModel();
    }

    settings.complaintsSystemOpen = dto.complaintsSystemOpen;
    if (dto.blacklistedStudentCodes !== undefined) {
      settings.blacklistedStudentCodes = dto.blacklistedStudentCodes;
    }
    if (dto.complaintOpenAt !== undefined) {
      settings.complaintOpenAt = new Date(dto.complaintOpenAt);
    }
    if (dto.complaintCloseAt !== undefined) {
      settings.complaintCloseAt = new Date(dto.complaintCloseAt);
    }
    if (
      settings.complaintOpenAt &&
      settings.complaintCloseAt &&
      settings.complaintCloseAt < settings.complaintOpenAt
    ) {
      throw new BadRequestException(
        'وقت إغلاق استقبال الشكاوى يجب أن يكون بعد وقت الفتح',
      );
    }
    settings.updatedBy = new Types.ObjectId(adminId);

    const savedSettings = await settings.save();
    this.logger.log('Complaint settings updated', {
      context: ComplaintsService.name,
      adminId,
      complaintsSystemOpen: savedSettings.complaintsSystemOpen,
      complaintOpenAt: savedSettings.complaintOpenAt?.toISOString(),
      complaintCloseAt: savedSettings.complaintCloseAt?.toISOString(),
      blacklistedStudentCodesCount:
        savedSettings.blacklistedStudentCodes.length,
    });

    return savedSettings;
  }

  async create(
    dto: CreateComplaintDto,
    studentId: string,
  ): Promise<ComplaintDocument> {
    // 1. Fetch student info
    const student = await this.userModel.findById(studentId);
    if (!student || student.role !== 'student') {
      throw new BadRequestException('الطالب غير موجود');
    }

    return this.createForStudent(dto, student);
  }

  async createPublic(
    dto: PublicCreateComplaintDto,
  ): Promise<ComplaintDocument> {
    const student = await this.userModel
      .findOne({
        role: 'student',
        studentCode: dto.studentCode.trim(),
        isActive: true,
      })
      .select('+nationalIdHash');

    const nationalIdMatches = student
      ? student.nationalIdHash
        ? await bcrypt.compare(dto.nationalId, student.nationalIdHash)
        : student.nationalId === dto.nationalId
      : false;

    if (!student || !nationalIdMatches) {
      this.logger.warn(
        'Public complaint rejected: identity verification failed',
        {
          context: ComplaintsService.name,
          studentCode: dto.studentCode,
        },
      );
      throw new BadRequestException(
        'Student information could not be verified',
      );
    }

    return this.createForStudent(dto, student, {
      requesterName: dto.requesterName,
      contactPhone: dto.contactPhone,
      contactEmail: dto.contactEmail,
      nationalIdMasked: this.maskNationalId(dto.nationalId),
    });
  }

  private async createForStudent(
    dto: CreateComplaintDto,
    student: UserDocument,
    publicContact?: {
      requesterName?: string;
      contactPhone?: string;
      contactEmail?: string;
      nationalIdMasked?: string;
    },
  ): Promise<ComplaintDocument> {
    // 1. Daily complaint limit (3 per student per day)
    const todayCount = await this.countTodayTickets(student._id.toString());
    if (todayCount >= 3) {
      this.logger.warn('Daily complaint limit reached', {
        context: ComplaintsService.name,
        studentId: String(student._id),
        studentCode: student.studentCode,
        todayCount,
      });
      throw new BadRequestException(
        'لقد وصلت للحد الأقصى من البلاغات اليومية (3 بلاغات). حاول مرة أخرى غداً',
      );
    }

    // 2. Validate system settings status
    const settings = await this.getSettings();
    if (!settings.complaintsSystemOpen) {
      throw new BadRequestException(
        'Complaints system is currently closed by the administration',
      );
    }

    const now = new Date();
    if (settings.complaintOpenAt && now < settings.complaintOpenAt) {
      throw new BadRequestException('لم يبدأ وقت استقبال الشكاوى بعد');
    }
    if (settings.complaintCloseAt && now > settings.complaintCloseAt) {
      throw new BadRequestException('انتهى وقت استقبال الشكاوى');
    }

    // 3. Validate student blacklist status
    if (settings.blacklistedStudentCodes.includes(student.studentCode || '')) {
      throw new BadRequestException(
        'Your account has been suspended from submitting new complaints',
      );
    }

    const ticketNumber = await this.generateUniqueTicketNumber();

    const newTicket = new this.complaintModel({
      ticketNumber,
      studentId: student._id,
      studentCode: student.studentCode,
      studentName: student.name,
      requesterName: publicContact?.requesterName,
      contactPhone: publicContact?.contactPhone ?? student.phone,
      contactEmail: publicContact?.contactEmail ?? student.email,
      nationalIdMasked: publicContact?.nationalIdMasked,
      type: dto.type,
      department: dto.department ?? this.getDefaultDepartment(dto.type),
      assignedGroup: (() => {
        const dept = dto.department ?? this.getDefaultDepartment(dto.type);
        const mapping: Record<string, string> = {
          student_affairs: 'شؤون الطلاب',
          technical_support: 'الدعم الفني',
          finance: 'المالية',
          control: 'الكنترول',
          academic_advising: 'الإرشاد الأكاديمي',
        };
        return mapping[dept];
      })(),
      title: dto.title,
      description: dto.description,
      priority: dto.priority || 'medium',
      status: 'open',
      replies: [],
      internalNotes: [],
      screenshotUrl: dto.screenshotUrl || dto.screenshot,
      statusHistory: [
        {
          fromStatus: 'new',
          toStatus: 'open',
          changedByName: 'system',
          changedAt: new Date(),
        },
      ],
    });

    const savedTicket = await newTicket.save();
    this.logger.log('Complaint ticket created', {
      context: ComplaintsService.name,
      ticketId: String(savedTicket._id),
      ticketNumber: savedTicket.ticketNumber,
      studentId: String(student._id),
      studentCode: student.studentCode,
      type: savedTicket.type,
      department: savedTicket.department,
      priority: savedTicket.priority,
    });

    return savedTicket;
  }

  private maskNationalId(nationalId: string): string {
    return `${nationalId.slice(0, 3)}********${nationalId.slice(-3)}`;
  }

  /** Count how many tickets a student has created today (since midnight UTC) */
  private async countTodayTickets(studentId: string): Promise<number> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    return this.complaintModel.countDocuments({
      studentId: new Types.ObjectId(studentId),
      createdAt: { $gte: startOfToday },
    });
  }

  private getDefaultDepartment(type: ComplaintType): ComplaintDepartment {
    const departmentByType: Record<ComplaintType, ComplaintDepartment> = {
      complaint: 'student_affairs',
      technical_issue: 'technical_support',
      academic: 'academic_advising',
      financial: 'finance',
      facility: 'student_affairs',
      other: 'student_affairs',
    };

    return departmentByType[type];
  }

  private async generateUniqueTicketNumber(): Promise<string> {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    for (let attempt = 0; attempt < 5; attempt++) {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const ticketNumber = `TKT-${dateStr}-${randomSuffix}`;
      const existing = await this.complaintModel.exists({ ticketNumber });
      if (!existing) {
        return ticketNumber;
      }
    }

    throw new BadRequestException('Could not generate a unique ticket number');
  }

  async findAll(query: QueryComplaintDto) {
    const { page, limit, skip } = buildPaginationOptions(query);
    const filter: FilterQuery<ComplaintDocument> = {};

    if (query.search) {
      const search = normalizeSearchTerm(query.search);
      filter.$or = [
        { ticketNumber: { $regex: search, $options: 'i' } },
        { studentCode: { $regex: search, $options: 'i' } },
        { studentName: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
      ];
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.type) {
      filter.type = query.type;
    }

    if (query.priority) {
      filter.priority = query.priority;
    }

    if (query.assignedGroup) {
      filter.assignedGroup = query.assignedGroup;
    }

    if (query.department) {
      filter.department = query.department;
    }

    if (query.assignedStaffId) {
      filter.assignedStaffId = new Types.ObjectId(query.assignedStaffId);
    }

    if (query.dateFrom || query.dateTo) {
      filter.createdAt = {};
      if (query.dateFrom) {
        filter.createdAt.$gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        filter.createdAt.$lte = new Date(query.dateTo);
      }
    }

    const [items, total] = await Promise.all([
      this.complaintModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.complaintModel.countDocuments(filter),
    ]);

    return createPaginatedResult(items, total, page, limit);
  }

  async findByStudent(studentId: string): Promise<Complaint[]> {
    const student = await this.userModel.findById(studentId);
    const filter: any = {
      $or: [
        { studentId: new Types.ObjectId(studentId) },
        { studentId: studentId },
      ],
    };
    if (student?.studentCode) {
      filter.$or.push({ studentCode: student.studentCode });
    }
    return this.complaintModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async findAssignableStaff() {
    return this.userModel
      .find({
        role: { $in: ['admin', 'staff'] },
        isActive: true,
      })
      .select('_id name email role permissions')
      .sort({ role: 1, name: 1 })
      .lean();
  }

  async findOne(id: string): Promise<ComplaintDocument> {
    const ticket = await this.complaintModel.findById(id);
    if (!ticket) {
      throw new NotFoundException('الشكوى غير موجودة'); // Ticket not found
    }
    return ticket;
  }

  async updateStatus(
    id: string,
    dto: UpdateComplaintStatusDto,
    actorId?: string,
  ): Promise<ComplaintDocument> {
    const ticket = await this.findOne(id);

    let actor: UserDocument | null = null;
    if (actorId) {
      actor = await this.userModel.findById(actorId);
    }

    if (dto.status && ticket.status !== dto.status) {
      ticket.statusHistory.push({
        fromStatus: ticket.status,
        toStatus: dto.status,
        changedBy: actor ? new Types.ObjectId(String(actor._id)) : undefined,
        changedByName: actor?.name,
        changedAt: new Date(),
      });
      ticket.status = dto.status;
    }
    if (dto.priority) {
      ticket.priority = dto.priority;
    }
    if (dto.assignedGroup !== undefined) {
      ticket.assignedGroup = dto.assignedGroup || undefined;
    }
    if (dto.department) {
      ticket.department = dto.department;
    }
    if (dto.assignedStaffId) {
      const assignedStaff = await this.userModel.findOne({
        _id: new Types.ObjectId(dto.assignedStaffId),
        role: { $in: ['admin', 'staff'] },
        isActive: true,
      });

      if (!assignedStaff) {
        throw new BadRequestException('الموظف المسؤول غير موجود');
      }

      ticket.assignedStaffId = new Types.ObjectId(String(assignedStaff._id));
      ticket.assignedStaffName = assignedStaff.name;
    }
    if (dto.internalNote?.trim()) {
      if (!actor) {
        throw new BadRequestException('المستخدم غير موجود');
      }
      ticket.internalNotes.push({
        authorId: new Types.ObjectId(String(actor._id)),
        authorName: actor.name,
        message: dto.internalNote.trim(),
        createdAt: new Date(),
      });
    }
    const savedTicket = await ticket.save();
    this.logger.log('Complaint ticket updated', {
      context: ComplaintsService.name,
      ticketId: id,
      ticketNumber: savedTicket.ticketNumber,
      actorId,
      status: savedTicket.status,
      priority: savedTicket.priority,
      department: savedTicket.department,
      assignedGroup: savedTicket.assignedGroup,
      assignedStaffId: savedTicket.assignedStaffId
        ? String(savedTicket.assignedStaffId)
        : undefined,
      hasInternalNote: Boolean(dto.internalNote?.trim()),
    });

    if (dto.status) {
      try {
        const statusLabelAr =
          dto.status === 'open'
            ? 'مفتوحة'
            : dto.status === 'in_progress'
              ? 'قيد المعالجة'
              : 'مغلقة';
        const statusLabelEn =
          dto.status === 'open'
            ? 'Open'
            : dto.status === 'in_progress'
              ? 'In Progress'
              : 'Closed';
        await this.notificationsService.sendNotification(
          {
            targetType: 'student',
            targetStudentCode: savedTicket.studentCode,
            title: 'تحديث حالة الشكوى | Complaint Status',
            body: `تم تحديث حالة الشكوى رقم #${savedTicket.ticketNumber} إلى: ${statusLabelAr} (${statusLabelEn})`,
          },
          String(actorId || 'system'),
        );
      } catch (err) {
        this.logger.error(
          'Failed to send status update notification',
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    return savedTicket;
  }

  async addReply(
    id: string,
    dto: ReplyComplaintDto,
    senderId: string,
    senderRole: 'admin' | 'staff' | 'student',
  ): Promise<ComplaintDocument> {
    const ticket = await this.findOne(id);

    // Validate student owns ticket if sender is student
    if (senderRole === 'student' && ticket.studentId.toString() !== senderId) {
      throw new ForbiddenException('غير مصرح بالرد على هذه الشكوى'); // Not authorized
    }

    if (senderRole === 'student') {
      const todayReplyCount = await this.countTodayStudentReplies(senderId);
      if (todayReplyCount >= 3) {
        throw new BadRequestException(
          'You have reached the daily reply limit (3 messages). Please try again tomorrow.',
        );
      }
    }

    if (ticket.status === 'closed') {
      throw new BadRequestException('لا يمكن إضافة رد على تذكرة مغلقة');
    }

    const sender = await this.userModel.findById(senderId);
    if (!sender) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    ticket.replies.push({
      senderId: new Types.ObjectId(String(sender._id)),
      senderName: sender.name,
      senderRole,
      message: dto.message,
      createdAt: new Date(),
    });

    // Auto-update status to resolved/in-progress if admin replies, optional but premium touch
    if (senderRole !== 'student' && ticket.status === 'open') {
      ticket.statusHistory.push({
        fromStatus: ticket.status,
        toStatus: 'in_progress',
        changedBy: new Types.ObjectId(String(sender._id)),
        changedByName: sender.name,
        changedAt: new Date(),
      });
      ticket.status = 'in_progress';
    }

    const savedTicket = await ticket.save();
    this.logger.log('Complaint reply added', {
      context: ComplaintsService.name,
      ticketId: id,
      ticketNumber: savedTicket.ticketNumber,
      senderId,
      senderRole,
      replyCount: savedTicket.replies.length,
      status: savedTicket.status,
    });

    if (senderRole !== 'student') {
      try {
        await this.notificationsService.sendNotification(
          {
            targetType: 'student',
            targetStudentCode: savedTicket.studentCode,
            title: 'رد جديد على الشكوى | Complaint Reply',
            body: `تمت إضافة رد جديد على شكواك رقم #${savedTicket.ticketNumber}`,
          },
          senderId,
        );
      } catch (err) {
        this.logger.error(
          'Failed to send complaint reply notification',
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    return savedTicket;
  }

  private async countTodayStudentReplies(studentId: string): Promise<number> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [result] = await this.complaintModel.aggregate<{ count: number }>([
      { $unwind: '$replies' },
      {
        $match: {
          'replies.senderId': new Types.ObjectId(studentId),
          'replies.senderRole': 'student',
          'replies.createdAt': { $gte: startOfToday },
        },
      },
      { $count: 'count' },
    ]);

    return result?.count ?? 0;
  }

  async delete(id: string, actorId: string): Promise<{ success: boolean; id: string }> {
    const deleted = await this.complaintModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException(`Complaint ticket #${id} not found`);
    }
    this.logger.warn(`Admin ${actorId} deleted complaint #${id} (${deleted.ticketNumber})`, 'ComplaintsService');
    return { success: true, id };
  }

  async bulkDelete(ids: string[], actorId: string): Promise<{ success: boolean; deletedCount: number }> {
    const validIds = ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
    if (validIds.length === 0) {
      return { success: true, deletedCount: 0 };
    }
    const result = await this.complaintModel.deleteMany({ _id: { $in: validIds } }).exec();
    this.logger.warn(
      `Admin ${actorId} bulk deleted ${result.deletedCount} complaints`,
      'ComplaintsService',
    );
    return { success: true, deletedCount: result.deletedCount };
  }

  async clearAll(actorId: string): Promise<{ success: boolean; deletedCount: number }> {
    const result = await this.complaintModel.deleteMany({}).exec();
    this.logger.warn(
      `Admin ${actorId} purged all ${result.deletedCount} complaints`,
      'ComplaintsService',
    );
    return { success: true, deletedCount: result.deletedCount };
  }
}

