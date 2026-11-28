import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  loadProvisionalPolicy,
  provisionalPolicyKey,
} from '../admissions/enrollment-policy';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash } from 'crypto';
import {
  ExamSchedule,
  ExamScheduleDocument,
} from './schemas/exam-schedule.schema';
import {
  StudentProfile,
  StudentProfileDocument,
} from '../students/schemas/student-profile.schema';
import {
  CreateExamScheduleDto,
  UpdateExamScheduleDto,
  QueryExamScheduleDto,
} from './dto/exam-schedule.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { CacheService } from '../../core/cache/cache.service';

export interface ExamScheduleUploadFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

interface CloudinaryUploadResponse {
  secure_url?: string;
  public_id?: string;
}

type ScheduleUploadKind = 'image' | 'raw';

@Injectable()
export class ExamSchedulesService {
  constructor(
    private readonly configService: ConfigService,
    @InjectModel(ExamSchedule.name)
    private examScheduleModel: Model<ExamScheduleDocument>,
    @InjectModel(StudentProfile.name)
    private studentModel: Model<StudentProfileDocument>,
    private notificationsService: NotificationsService,
    @Optional() private readonly cacheService?: CacheService,
  ) {}

  private getCloudinaryConfig() {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      throw new BadRequestException('Cloudinary upload is not configured');
    }

    return { cloudName, apiKey, apiSecret };
  }

  private createCloudinarySignature(
    params: Record<string, string>,
    apiSecret: string,
  ) {
    const normalizedParams = Object.entries(params)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    return createHash('sha1')
      .update(`${normalizedParams}${apiSecret}`)
      .digest('hex');
  }

  private buildOptimizedImageUrl(cloudName: string, publicId: string) {
    return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto,c_limit,w_1600,dpr_auto/${encodeURI(
      publicId,
    )}`;
  }

  private getUploadKind(file: ExamScheduleUploadFile): ScheduleUploadKind {
    if (
      file.mimetype === 'application/pdf' ||
      /\.pdf$/i.test(file.originalname)
    ) {
      return 'raw';
    }

    return 'image';
  }

  async uploadImage(
    file: ExamScheduleUploadFile,
  ): Promise<{ fileUrl: string; publicId: string }> {
    const { cloudName, apiKey, apiSecret } = this.getCloudinaryConfig();
    const uploadKind = this.getUploadKind(file);

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const folder = 'exam-schedules';
    const signature = this.createCloudinarySignature(
      {
        folder,
        timestamp,
      },
      apiSecret,
    );

    const safeFilename = `schedule_${Date.now()}${uploadKind === 'raw' ? '.pdf' : '.jpg'}`;
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
      safeFilename,
    );
    formData.append('api_key', apiKey);
    formData.append('folder', folder);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/${uploadKind}/upload`,
      {
        method: 'POST',
        body: formData,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(
        `Cloudinary upload failed: ${errorText || response.statusText}`,
      );
    }

    const result = (await response.json()) as CloudinaryUploadResponse;

    if (!result.secure_url || !result.public_id) {
      throw new BadRequestException('Cloudinary did not return a file URL');
    }

    return {
      fileUrl:
        uploadKind === 'image'
          ? this.buildOptimizedImageUrl(cloudName, result.public_id)
          : result.secure_url,
      publicId: result.public_id,
    };
  }

  async create(dto: CreateExamScheduleDto): Promise<ExamScheduleDocument> {
    const created = new this.examScheduleModel(dto);
    const saved = await created.save();

    if (this.cacheService) {
      await this.cacheService.del('exams:schedules:published');
      await this.cacheService.delPattern('exams:schedules:*');
    }

    if (saved.isPublished) {
      try {
        await this.notificationsService.sendNotification(
          {
            targetType: 'all',
            title: 'جدول الامتحانات | Exam Schedule Published',
            body: `تم نشر جدول امتحانات جديد: ${saved.title}`,
          },
          'system',
        );
      } catch (err) {
        console.error('Failed to send exam schedule notification:', err);
      }
    }

    return saved;
  }

  async findAll(query: QueryExamScheduleDto): Promise<ExamSchedule[]> {
    const filter: any = {};
    if (query.examType) filter.examType = query.examType;
    if (query.isPublished !== undefined) filter.isPublished = query.isPublished;

    const cacheKey = `exams:schedules:${query.examType || 'all'}:${query.isPublished ?? 'all'}`;
    const queryFn = () =>
      this.examScheduleModel.find(filter).sort({ createdAt: -1 }).lean();

    if (this.cacheService) {
      return this.cacheService.wrap(cacheKey, queryFn, 900);
    }

    return queryFn();
  }

  async findOne(id: string): Promise<ExamScheduleDocument> {
    const schedule = await this.examScheduleModel.findById(id);
    if (!schedule) {
      throw new NotFoundException('جدول الامتحانات غير موجود'); // Exam schedule not found
    }
    return schedule;
  }

  async update(
    id: string,
    dto: UpdateExamScheduleDto,
  ): Promise<ExamScheduleDocument> {
    const updated = await this.examScheduleModel.findByIdAndUpdate(
      id,
      { $set: dto },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('جدول الامتحانات غير موجود');
    }

    if (this.cacheService) {
      await this.cacheService.del('exams:schedules:published');
      await this.cacheService.delPattern('exams:schedules:*');
    }

    if (updated.isPublished) {
      try {
        await this.notificationsService.sendNotification(
          {
            targetType: 'all',
            title: 'جدول الامتحانات | Exam Schedule Updated',
            body: `تم تحديث جدول الامتحانات: ${updated.title}`,
          },
          'system',
        );
      } catch (err) {
        console.error('Failed to send exam schedule notification:', err);
      }
    }

    return updated;
  }

  async remove(id: string): Promise<{ message: string }> {
    const deleted = await this.examScheduleModel.findByIdAndDelete(id);
    if (!deleted) {
      throw new NotFoundException('جدول الامتحانات غير موجود');
    }

    if (this.cacheService) {
      await this.cacheService.del('exams:schedules:published');
      await this.cacheService.delPattern('exams:schedules:*');
    }

    return { message: 'تم حذف جدول الامتحانات بنجاح' }; // Schedule deleted successfully
  }

  // ─── Student Seat & Schedules ───────────────────────────────────

  async getStudentExamAssignment(userId: string) {
    let profile: any = null;
    if (Types.ObjectId.isValid(userId)) {
      profile = await this.studentModel.findOne({ userId }).lean();
      if (!profile) {
        const user = await this.studentModel.db
          .model('User')
          .findById(userId)
          .lean();
        if (user && (user as any).studentCode) {
          profile = await this.studentModel
            .findOne({ studentCode: (user as any).studentCode })
            .lean();
        }
      }
    }

    const fetchSchedules = () =>
      this.examScheduleModel
        .find({ isPublished: true })
        .sort({ createdAt: -1 })
        .lean();

    const publishedSchedules = this.cacheService
      ? await this.cacheService.wrap(
          'exams:schedules:published',
          fetchSchedules,
          900,
        )
      : await fetchSchedules();

    const scopes = new Map<string, ReturnType<typeof loadProvisionalPolicy>>();
    const schedules =
      profile?.officialEnrollmentStatus === 'PROVISIONAL'
        ? (
            await Promise.all(
              (publishedSchedules ?? []).map(async (schedule) => {
                if (schedule.examType !== 'final') return schedule;
                const key = provisionalPolicyKey(
                  schedule.academicYear,
                  schedule.semester,
                );
                if (!scopes.has(key))
                  scopes.set(
                    key,
                    loadProvisionalPolicy(
                      this.studentModel.db,
                      schedule.academicYear,
                      schedule.semester,
                    ),
                  );
                return (await scopes.get(key))?.finalExam ? schedule : null;
              }),
            )
          ).filter((schedule) => schedule !== null)
        : publishedSchedules;
    return {
      seatNumber: profile?.seatNumber || null,
      examRoom: profile?.examRoom || null,
      examFloor: profile?.examFloor || null,
      examBuilding: profile?.examBuilding || null,
      schedules: schedules || [],
    };
  }
}
