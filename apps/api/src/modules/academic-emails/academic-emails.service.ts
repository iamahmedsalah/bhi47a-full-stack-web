import {
  Injectable,
  NotFoundException,
  ConflictException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AcademicEmail,
  AcademicEmailDocument,
} from './schemas/academic-email.schema';
import {
  StudentProfile,
  StudentProfileDocument,
} from '../students/schemas/student-profile.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  UpdateAcademicEmailDto,
  QueryAcademicEmailDto,
} from './dto/academic-email.dto';
import {
  buildPaginationOptions,
  createPaginatedResult,
} from '../../common/utils/pagination.util';
import { normalizeSearchTerm } from '../../common/utils/search.util';
import { shouldRunStartupTasks } from '../../common/utils/runtime.util';

@Injectable()
export class AcademicEmailsService implements OnModuleInit {
  private readonly logger = new Logger(AcademicEmailsService.name);

  constructor(
    @InjectModel(AcademicEmail.name)
    private emailModel: Model<AcademicEmailDocument>,
    @InjectModel(StudentProfile.name)
    private profileModel: Model<StudentProfileDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
  ) {}

  onModuleInit() {
    if (!shouldRunStartupTasks()) {
      this.logger.log('Skipping startup sync in serverless runtime');
      return;
    }

    // Non-blocking auto-sync on server startup
    void this.syncFromStudentProfiles().catch((err) => {
      this.logger.warn(`Startup sync error: ${err.message}`);
    });
  }

  /**
   * Synchronizes academic email records with student profiles and users,
   * guaranteeing that every student in the database has a linked academic email record.
   */
  async syncFromStudentProfiles(): Promise<number> {
    try {
      const profiles = await this.profileModel
        .find({
          studentCode: { $exists: true, $ne: '' },
        })
        .select('userId studentCode fullName academicEmail')
        .lean();

      if (profiles.length === 0) return 0;

      const existingEmails = await this.emailModel
        .find({}, { studentCode: 1, academicEmail: 1 })
        .lean();
      const existingMap = new Map(existingEmails.map((e) => [e.studentCode, e]));

      const bulkOps: any[] = [];

      for (const p of profiles) {
        const sc = p.studentCode.trim();
        if (!sc) continue;

        const emailStr =
          (p.academicEmail && p.academicEmail.trim()) ||
          `${sc}.bhi47@bhiasc.org`;

        const existing = existingMap.get(sc);

        if (!existing) {
          bulkOps.push({
            updateOne: {
              filter: { studentCode: sc },
              update: {
                $setOnInsert: {
                  studentId: p.userId || new Types.ObjectId(),
                  studentCode: sc,
                  studentName: p.fullName || `Student ${sc}`,
                  academicEmail: emailStr,
                  status: 'active',
                },
              },
              upsert: true,
            },
          });
        } else if (p.academicEmail && existing.academicEmail !== p.academicEmail) {
          bulkOps.push({
            updateOne: {
              filter: { studentCode: sc },
              update: {
                $set: {
                  academicEmail: p.academicEmail.trim(),
                  studentName: p.fullName || existing.studentName,
                },
              },
            },
          });
        }
      }

      if (bulkOps.length > 0) {
        await this.emailModel.bulkWrite(bulkOps, { ordered: false });
        this.logger.log(`[AcademicEmails] Synced ${bulkOps.length} student academic emails.`);
      }

      return bulkOps.length;
    } catch (err: any) {
      this.logger.error(`[AcademicEmails] Sync failed: ${err.message}`);
      return 0;
    }
  }

  async findAll(query: QueryAcademicEmailDto) {
    // If academic_emails has fewer records than student_profiles, run a fast sync
    const [emailCount, profileCount] = await Promise.all([
      this.emailModel.countDocuments(),
      this.profileModel.countDocuments({ studentCode: { $exists: true, $ne: '' } }),
    ]);

    if (emailCount < profileCount) {
      await this.syncFromStudentProfiles();
    }

    const { page, limit, skip } = buildPaginationOptions(query);
    const filter: any = {};

    if (query.search) {
      const search = normalizeSearchTerm(query.search);
      filter.$or = [
        { studentCode: { $regex: search, $options: 'i' } },
        { studentName: { $regex: search, $options: 'i' } },
        { academicEmail: { $regex: search, $options: 'i' } },
      ];
    }

    if (query.status) {
      filter.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.emailModel
        .find(filter)
        .sort({ studentCode: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.emailModel.countDocuments(filter),
    ]);

    return createPaginatedResult(items, total, page, limit);
  }

  async findOne(id: string): Promise<AcademicEmailDocument> {
    const record = await this.emailModel.findById(id);
    if (!record) {
      throw new NotFoundException('سجل البريد الأكاديمي غير موجود');
    }
    return record;
  }

  /**
   * Updates an academic email and propagates the change bidirectionally to
   * StudentProfile and User (auth) so they stay strictly in sync like relational foreign keys.
   */
  async update(
    id: string,
    dto: UpdateAcademicEmailDto,
    adminId: string,
  ): Promise<AcademicEmailDocument> {
    const record = await this.findOne(id);

    if (dto.academicEmail && dto.academicEmail !== record.academicEmail) {
      const existing = await this.emailModel.findOne({
        academicEmail: dto.academicEmail,
        _id: { $ne: new Types.ObjectId(id) },
      });
      if (existing) {
        throw new ConflictException('البريد الأكاديمي مستخدم بالفعل لطالب آخر');
      }
    }

    const updated = await this.emailModel.findByIdAndUpdate(
      id,
      {
        $set: {
          ...dto,
          lastUpdatedBy: new Types.ObjectId(adminId),
        },
      },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('سجل البريد الأكاديمي غير موجود');
    }

    // Relational Propagation: Sync to StudentProfile and User
    if (dto.academicEmail) {
      const newEmail = dto.academicEmail.trim();
      await Promise.all([
        this.profileModel.updateOne(
          { studentCode: record.studentCode },
          { $set: { academicEmail: newEmail } },
        ),
        this.userModel.updateOne(
          { _id: record.studentId },
          { $set: { email: newEmail } },
        ),
      ]);
    }

    return updated;
  }

  async findByStudentId(studentId: string): Promise<AcademicEmail> {
    let record = await this.emailModel.findOne({
      studentId: new Types.ObjectId(studentId),
    });

    if (!record) {
      // Check if student profile exists and create on-the-fly
      const profile = await this.profileModel.findOne({
        $or: [{ userId: new Types.ObjectId(studentId) }, { _id: new Types.ObjectId(studentId) }],
      });
      if (profile) {
        const emailStr =
          profile.academicEmail || `${profile.studentCode}.bhi47@bhiasc.org`;
        const created = await this.emailModel.create({
          studentId: profile.userId || new Types.ObjectId(studentId),
          studentCode: profile.studentCode,
          studentName: profile.fullName,
          academicEmail: emailStr,
          status: 'active',
        });
        return created.toObject();
      }
      throw new NotFoundException('البريد الأكاديمي غير مخصص بعد');
    }
    return record;
  }

  /**
   * Helper to upsert a student academic email when student is created or updated
   */
  async upsertStudentEmail(
    studentCode: string,
    fullName: string,
    academicEmail: string,
    userId?: Types.ObjectId,
  ) {
    if (!studentCode) return;
    const email = academicEmail?.trim() || `${studentCode}.bhi47@bhiasc.org`;
    await this.emailModel.updateOne(
      { studentCode },
      {
        $set: {
          studentCode,
          studentName: fullName,
          academicEmail: email,
          status: 'active',
          ...(userId ? { studentId: userId } : {}),
        },
      },
      { upsert: true },
    );
  }
}
