import {
  Injectable,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { Job } from 'bullmq';
import {
  Notification,
  NotificationDocument,
} from './schemas/notification.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  StudentProfile,
  StudentProfileDocument,
} from '../students/schemas/student-profile.schema';
import {
  SendNotificationDto,
  RegisterFcmTokenDto,
  QueryNotificationDto,
} from './dto/notification.dto';
import {
  buildPaginationOptions,
  createPaginatedResult,
} from '../../common/utils/pagination.util';
import { QueueService } from '../../core/queues/queue.service';

interface PushNotificationJob {
  notificationId: string;
  title: string;
  body: string;
  tokens: string[];
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private isFirebaseInitialized = false;

  get isInitialized(): boolean {
    return this.isFirebaseInitialized;
  }

  getFirebaseStatus(): { ready: boolean; message: string } {
    if (this.isFirebaseInitialized && getApps().length > 0) {
      return {
        ready: true,
        message: `Active (Project: ${process.env.FIREBASE_PROJECT_ID || 'fcm-bhi'})`,
      };
    }

    const hasConfig = Boolean(
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
    );

    if (!hasConfig) {
      return {
        ready: false,
        message: 'Credentials missing in .env (Push fallback to DB)',
      };
    }

    return {
      ready: false,
      message: 'Failed to initialize (Push fallback to DB)',
    };
  }

  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(StudentProfile.name)
    private studentProfileModel: Model<StudentProfileDocument>,
    private queueService: QueueService,
  ) {
    this.initializeFirebase();
  }

  onModuleInit() {
    this.queueService.registerWorker<PushNotificationJob>(
      'notifications',
      async (job: Job<PushNotificationJob>) => this.deliverPush(job.data),
    );
  }

  private initializeFirebase() {
    try {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY;

      if (projectId && clientEmail && privateKey) {
        if (!getApps().length) {
          initializeApp({
            credential: cert({
              projectId,
              clientEmail,
              privateKey: privateKey.includes('\\n')
                ? privateKey.split('\\n').join('\n')
                : privateKey,
            }),
          });
        }
        this.isFirebaseInitialized = true;
        console.log('Firebase Admin SDK initialized successfully.');
      } else {
        console.log(
          'Firebase credentials not set in .env. Notifications will be stored in DB but push delivery will be simulated.',
        );
      }
    } catch (err) {
      console.error('Failed to initialize Firebase Admin SDK:', err);
    }
  }

  async registerToken(
    userId: string,
    dto: RegisterFcmTokenDto,
  ): Promise<{ message: string }> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const exists = user.fcmTokens.find((t) => t.token === dto.token);
    if (exists) {
      exists.lastUsedAt = new Date();
      exists.platform = dto.platform;
    } else {
      user.fcmTokens.push({
        token: dto.token,
        platform: dto.platform,
        lastUsedAt: new Date(),
      });
    }

    await user.save();
    return { message: 'Device token registered successfully' };
  }

  async getStudentFeed(userId: string, query: QueryNotificationDto = {}) {
    const { page, limit, skip } = buildPaginationOptions(query);
    const filter = await this.buildStudentNotificationFilter(userId);

    // Always exclude notifications hidden by the user
    filter.$and = [
      ...(filter.$and || []),
      { 'hiddenBy.userId': { $ne: new Types.ObjectId(userId) } },
    ];

    if (query.unreadOnly) {
      filter.$and.push({
        'readBy.userId': { $ne: new Types.ObjectId(userId) },
      });
    }

    const [items, total] = await Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.notificationModel.countDocuments(filter),
    ]);

    const formatted = items.map((item) => this.withReadState(item, userId));
    return createPaginatedResult(formatted, total, page, limit);
  }

  async markAsRead(userId: string, notificationId: string) {
    await this.ensureStudentCanAccessNotification(userId, notificationId);

    await this.notificationModel.updateOne(
      { _id: notificationId },
      {
        $pull: { readBy: { userId: new Types.ObjectId(userId) } },
      },
    );

    const updated = await this.notificationModel.findByIdAndUpdate(
      notificationId,
      {
        $push: {
          readBy: {
            userId: new Types.ObjectId(userId),
            readAt: new Date(),
          },
        },
      },
      { new: true },
    );

    return this.withReadState(updated?.toObject(), userId);
  }

  async markAsUnread(userId: string, notificationId: string) {
    await this.ensureStudentCanAccessNotification(userId, notificationId);

    const updated = await this.notificationModel.findByIdAndUpdate(
      notificationId,
      {
        $pull: { readBy: { userId: new Types.ObjectId(userId) } },
      },
      { new: true },
    );

    return this.withReadState(updated?.toObject(), userId);
  }

  async markAllAsRead(userId: string) {
    const filter = await this.buildStudentNotificationFilter(userId);
    const notifications = await this.notificationModel
      .find({
        ...filter,
        'readBy.userId': { $ne: new Types.ObjectId(userId) },
      })
      .select('_id')
      .lean();

    if (notifications.length === 0) {
      return { modifiedCount: 0 };
    }

    const result = await this.notificationModel.updateMany(
      { _id: { $in: notifications.map((item) => item._id) } },
      {
        $push: {
          readBy: {
            userId: new Types.ObjectId(userId),
            readAt: new Date(),
          },
        },
      },
    );

    return { modifiedCount: result.modifiedCount };
  }

  async hideNotification(userId: string, notificationId: string) {
    await this.ensureStudentCanAccessNotification(userId, notificationId);

    const updated = await this.notificationModel.findByIdAndUpdate(
      notificationId,
      {
        $addToSet: {
          hiddenBy: {
            userId: new Types.ObjectId(userId),
            hiddenAt: new Date(),
          },
        },
      },
      { new: true },
    );

    return this.withReadState(updated?.toObject(), userId);
  }

  async hideAllReadNotifications(userId: string) {
    const filter = await this.buildStudentNotificationFilter(userId);

    const readNotifications = await this.notificationModel
      .find({
        ...filter,
        'readBy.userId': new Types.ObjectId(userId),
        'hiddenBy.userId': { $ne: new Types.ObjectId(userId) },
      })
      .select('_id')
      .lean();

    if (readNotifications.length === 0) {
      return { modifiedCount: 0 };
    }

    const ids = readNotifications.map((n) => n._id);

    const result = await this.notificationModel.updateMany(
      { _id: { $in: ids } },
      {
        $push: {
          hiddenBy: {
            userId: new Types.ObjectId(userId),
            hiddenAt: new Date(),
          },
        },
      },
    );

    return { modifiedCount: result.modifiedCount };
  }

  async sendNotification(
    dto: SendNotificationDto,
    senderId: string,
  ): Promise<NotificationDocument> {
    let targetStudentId: Types.ObjectId | undefined;

    if (dto.targetType === 'student') {
      if (!dto.targetStudentCode) {
        throw new BadRequestException(
          'Student code is required for student-targeted notifications',
        );
      }
      const student = await this.userModel.findOne({
        studentCode: dto.targetStudentCode,
      });
      if (!student) {
        throw new NotFoundException('Target student not found');
      }
      targetStudentId = student._id;
    }

    if (dto.targetType === 'level' && !dto.targetLevel) {
      throw new BadRequestException(
        'Target level is required for level-targeted notifications',
      );
    }

    const notification = new this.notificationModel({
      title: dto.title,
      body: dto.body,
      targetType: dto.targetType,
      targetLevel: dto.targetLevel,
      targetStudentId,
      sentBy: new Types.ObjectId(String(senderId)),
      meta: {
        ...((dto as any).meta || {}),
        sendWhatsApp: Boolean(dto.sendWhatsApp),
      },
    });

    if (dto.sendWhatsApp) {
      console.log(
        `[WhatsApp Automation] Notification queued for student phone number WhatsApp delivery. Target: ${dto.targetType}`,
      );
    }

    await notification.save();

    const tokens = await this.collectTargetTokens(dto, targetStudentId);

    if (tokens.length === 0) {
      notification.deliveryStatus = 'skipped';
      notification.pushSuccessCount = 0;
      notification.pushFailureCount = 0;
      notification.sentAt = new Date();
      await notification.save();
      return notification;
    }

    notification.deliveryStatus = this.queueService.enabled
      ? 'queued'
      : 'pending';
    notification.queuedAt = new Date();
    await notification.save();

    await this.queueService.add<PushNotificationJob>(
      'notifications',
      'send-fcm',
      {
        notificationId: notification._id.toString(),
        title: dto.title,
        body: dto.body,
        tokens,
      },
      (data) => this.deliverPush(data),
    );

    return (
      (await this.notificationModel.findById(notification._id)) || notification
    );
  }

  async listSentHistory(query: QueryNotificationDto) {
    const { page, limit, skip } = buildPaginationOptions(query);

    const [items, total] = await Promise.all([
      this.notificationModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('sentBy', 'name email')
        .lean(),
      this.notificationModel.countDocuments(),
    ]);

    return createPaginatedResult(items, total, page, limit);
  }

  private async deliverPush(data: PushNotificationJob) {
    try {
      if (!this.isFirebaseInitialized) {
        await this.notificationModel.findByIdAndUpdate(data.notificationId, {
          $set: {
            deliveryStatus: 'skipped',
            pushSuccessCount: 0,
            pushFailureCount: data.tokens.length,
            pushError: 'Firebase credentials are not configured',
            sentAt: new Date(),
          },
        });

        console.log(
          `[Push Notification Simulation] Title: "${data.title}" | Body: "${data.body}" | Sent to: ${data.tokens.length} virtual devices.`,
        );
        return;
      }

      const response = await getMessaging().sendEachForMulticast({
        tokens: data.tokens,
        notification: {
          title: data.title,
          body: data.body,
        },
      });

      await this.notificationModel.findByIdAndUpdate(data.notificationId, {
        $set: {
          deliveryStatus:
            response.failureCount > 0 && response.successCount === 0
              ? 'failed'
              : 'sent',
          pushSuccessCount: response.successCount,
          pushFailureCount: response.failureCount,
          pushError:
            response.failureCount > 0
              ? `${response.failureCount} FCM deliveries failed`
              : undefined,
          sentAt: new Date(),
        },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.notificationModel.findByIdAndUpdate(data.notificationId, {
        $set: {
          deliveryStatus: 'failed',
          pushSuccessCount: 0,
          pushFailureCount: data.tokens.length,
          pushError: errorMessage,
          sentAt: new Date(),
        },
      });
      throw err;
    }
  }

  private async collectTargetTokens(
    dto: SendNotificationDto,
    targetStudentId?: Types.ObjectId,
  ): Promise<string[]> {
    const tokens: string[] = [];
    const collectTokens = (users: UserDocument[]) => {
      users.forEach((u) => {
        u.fcmTokens.forEach((t) => tokens.push(t.token));
      });
    };

    if (dto.targetType === 'all') {
      const users = await this.userModel.find({
        role: 'student',
        isActive: true,
        'fcmTokens.0': { $exists: true },
      });
      collectTokens(users);
    } else if (dto.targetType === 'student' && targetStudentId) {
      const student = await this.userModel.findById(targetStudentId);
      if (student) {
        collectTokens([student]);
      }
    } else if (dto.targetType === 'level') {
      const profiles = await this.studentProfileModel
        .find({ level: dto.targetLevel })
        .select('userId')
        .lean();
      const userIds = profiles.map((profile) => profile.userId);

      const studentsInLevel = await this.userModel.find({
        _id: { $in: userIds },
        role: 'student',
        isActive: true,
        'fcmTokens.0': { $exists: true },
      });
      collectTokens(studentsInLevel);
    }

    return [...new Set(tokens)];
  }

  private async buildStudentNotificationFilter(userId: string) {
    const student = await this.userModel.findById(userId);
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const profile = await this.studentProfileModel
      .findOne({ userId: student._id })
      .select('level')
      .lean();

    const filter: {
      $or: Array<Record<string, unknown>>;
      $and?: Array<Record<string, unknown>>;
    } = {
      $or: [{ targetType: 'all' }, { targetStudentId: student._id }],
    };

    if (profile?.level) {
      filter.$or.push({ targetType: 'level', targetLevel: profile.level });
    }

    return filter;
  }

  private async ensureStudentCanAccessNotification(
    userId: string,
    notificationId: string,
  ) {
    const filter = await this.buildStudentNotificationFilter(userId);
    const notification = await this.notificationModel.findOne({
      _id: notificationId,
      ...filter,
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }

  private withReadState(item: any, userId: string | Types.ObjectId) {
    if (!item) {
      return item;
    }

    const userIdStr = String(userId);

    const readEntry = item.readBy?.find(
      (entry: { userId: Types.ObjectId | string; readAt: Date }) =>
        entry.userId.toString() === userIdStr,
    );

    return {
      ...item,
      isRead: Boolean(readEntry),
      readAt: readEntry?.readAt,
    };
  }
}
