import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AcademicEmail,
  AcademicEmailDocument,
} from './schemas/academic-email.schema';
import {
  UpdateAcademicEmailDto,
  QueryAcademicEmailDto,
} from './dto/academic-email.dto';
import {
  buildPaginationOptions,
  createPaginatedResult,
} from '../../common/utils/pagination.util';
import { normalizeSearchTerm } from '../../common/utils/search.util';

@Injectable()
export class AcademicEmailsService {
  constructor(
    @InjectModel(AcademicEmail.name)
    private emailModel: Model<AcademicEmailDocument>,
  ) {}

  async findAll(query: QueryAcademicEmailDto) {
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
      throw new NotFoundException('سجل البريد الأكاديمي غير موجود'); // Record not found
    }
    return record;
  }

  async update(
    id: string,
    dto: UpdateAcademicEmailDto,
    adminId: string,
  ): Promise<AcademicEmailDocument> {
    const record = await this.findOne(id);

    if (dto.academicEmail && dto.academicEmail !== record.academicEmail) {
      const existing = await this.emailModel.findOne({
        academicEmail: dto.academicEmail,
      });
      if (existing) {
        throw new ConflictException('البريد الأكاديمي مستخدم بالفعل'); // Email already in use
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
    return updated;
  }

  async findByStudentId(studentId: string): Promise<AcademicEmail> {
    const record = await this.emailModel.findOne({
      studentId: new Types.ObjectId(studentId),
    });
    if (!record) {
      throw new NotFoundException('البريد الأكاديمي غير مخصص بعد'); // Email not assigned yet
    }
    return record;
  }
}
