import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  RegistrationTerm,
  RegistrationTermDocument,
} from '../schemas/registration-term.schema';
import {
  CourseRegistration,
  CourseRegistrationDocument,
} from '../schemas/course-registration.schema';
import { AdvisingCase } from '../../academic-advising/schemas/advising-case.schema';
import {
  CreateAcademicYearDto,
  UpsertRegistrationTermDto,
} from '../dto/registration.dto';
import { isRegistrationTermCurrentlyOpen } from '../utils/registration-term.util';
import { isConsecutiveAcademicYear } from '../utils/academic-year.util';

function normalizeSemester(val?: string): string {
  if (!val) return 'first';
  const clean = String(val).trim().toLowerCase();
  if (
    clean === '1' ||
    clean === 'first' ||
    clean === 'أول' ||
    clean === 'الاول' ||
    clean === 'الأول' ||
    clean === 'الفصل الأول'
  )
    return 'first';
  if (
    clean === '2' ||
    clean === 'second' ||
    clean === 'ثاني' ||
    clean === 'الثاني' ||
    clean === 'الفصل الثاني'
  )
    return 'second';
  if (
    clean === '3' ||
    clean === 'summer' ||
    clean === 'صيفي' ||
    clean === 'الصيفي' ||
    clean === 'الفصل الصيفي'
  )
    return 'summer';
  return clean;
}

@Injectable()
export class RegistrationTermService {
  constructor(
    @InjectModel(RegistrationTerm.name)
    private readonly registrationTermModel: Model<RegistrationTermDocument>,
    @InjectModel(CourseRegistration.name)
    private readonly registrationModel: Model<CourseRegistrationDocument>,
    @InjectModel(AdvisingCase.name)
    private readonly advisingCaseModel: Model<AdvisingCase>,
  ) {}

  async listRegistrationTerms() {
    return this.registrationTermModel
      .find()
      .sort({ academicYear: -1, semester: 1 })
      .lean();
  }

  async listAcademicYears() {
    const [terms, registrationUsage, advisingUsage] = await Promise.all([
      this.registrationTermModel
        .find()
        .sort({ academicYear: -1, semester: 1 })
        .lean(),
      this.registrationModel.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$academicYear', count: { $sum: 1 } } },
      ]),
      this.advisingCaseModel.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$academicYear', count: { $sum: 1 } } },
      ]),
    ]);
    const registrationCounts = new Map(
      registrationUsage.map((item) => [item._id, item.count]),
    );
    const advisingCounts = new Map(
      advisingUsage.map((item) => [item._id, item.count]),
    );
    const grouped = new Map<string, typeof terms>();
    for (const term of terms) {
      const group = grouped.get(term.academicYear) ?? [];
      group.push(term);
      grouped.set(term.academicYear, group);
    }
    return Array.from(grouped.entries()).map(([academicYear, yearTerms]) => ({
      academicYear,
      isCurrent: yearTerms.some((term) => term.isCurrent),
      terms: yearTerms,
      registrationCount: registrationCounts.get(academicYear) ?? 0,
      advisingCaseCount: advisingCounts.get(academicYear) ?? 0,
    }));
  }

  async createAcademicYear(dto: CreateAcademicYearDto, adminId: string) {
    this.assertAcademicYear(dto.academicYear);
    const exists = await this.registrationTermModel.exists({
      academicYear: dto.academicYear,
    });
    if (exists) throw new ConflictException('Academic year already exists');
    const hasCurrent = await this.registrationTermModel.exists({
      isCurrent: true,
    });
    const makeCurrent = dto.makeCurrent === true || !hasCurrent;
    if (makeCurrent) {
      await this.registrationTermModel.updateMany(
        {},
        { $set: { isCurrent: false, isOpen: false } },
      );
    }
    await this.registrationTermModel.insertMany(
      (['first', 'second', 'summer'] as const).map((semester) => ({
        academicYear: dto.academicYear,
        semester,
        isOpen: false,
        isCurrent: makeCurrent,
        updatedBy: new Types.ObjectId(adminId),
      })),
    );
    return this.listAcademicYears();
  }

  async setCurrentAcademicYear(academicYear: string) {
    this.assertAcademicYear(academicYear);
    const exists = await this.registrationTermModel.exists({ academicYear });
    if (!exists) throw new NotFoundException('Academic year not found');
    await this.registrationTermModel.updateMany(
      { academicYear: { $ne: academicYear } },
      { $set: { isCurrent: false, isOpen: false } },
    );
    await this.registrationTermModel.updateMany(
      { academicYear },
      { $set: { isCurrent: true } },
    );
    return this.listAcademicYears();
  }

  async deleteAcademicYear(academicYear: string) {
    this.assertAcademicYear(academicYear);
    const terms = await this.registrationTermModel
      .find({ academicYear })
      .lean();
    if (!terms.length) throw new NotFoundException('Academic year not found');
    if (terms.some((term) => term.isCurrent)) {
      throw new ConflictException(
        'Set another academic year as current before deleting this year',
      );
    }
    const [registrationCount, advisingCaseCount] = await Promise.all([
      this.registrationModel.countDocuments({ academicYear }),
      this.advisingCaseModel.countDocuments({ academicYear }),
    ]);
    if (registrationCount || advisingCaseCount) {
      throw new ConflictException(
        'Academic year cannot be deleted because it contains registration or advising history',
      );
    }
    await this.registrationTermModel.deleteMany({ academicYear });
    return { deleted: true, academicYear };
  }

  async upsertRegistrationTerm(
    dto: UpsertRegistrationTermDto,
    adminId: string,
  ) {
    const opensAt = dto.opensAt ? new Date(dto.opensAt) : undefined;
    const closesAt = dto.closesAt ? new Date(dto.closesAt) : undefined;
    if (opensAt && closesAt && closesAt <= opensAt) {
      throw new BadRequestException(
        'Registration close date must be after the open date',
      );
    }
    const normSem = normalizeSemester(dto.semester);
    return this.registrationTermModel.findOneAndUpdate(
      { academicYear: dto.academicYear, semester: normSem },
      {
        $set: {
          isOpen: dto.isOpen,
          opensAt,
          closesAt,
          updatedBy: new Types.ObjectId(adminId),
        },
        $setOnInsert: {
          academicYear: dto.academicYear,
          semester: normSem,
        },
      },
      { new: true, upsert: true, runValidators: true },
    );
  }

  async getRegistrationTermStatus(academicYear: string, semester: string) {
    const normSem = normalizeSemester(semester);
    const term = await this.registrationTermModel
      .findOne({
        academicYear,
        $or: [{ semester: normSem }, { semester }],
      })
      .lean();
    const isCurrentlyOpen = isRegistrationTermCurrentlyOpen(term);
    return {
      academicYear,
      semester: normSem,
      configured: Boolean(term),
      isOpen: term?.isOpen ?? false,
      isCurrentlyOpen,
      opensAt: term?.opensAt,
      closesAt: term?.closesAt,
    };
  }

  async assertRegistrationTermOpen(academicYear: string, semester: string) {
    const status = await this.getRegistrationTermStatus(academicYear, semester);
    if (!status.isCurrentlyOpen) {
      throw new ForbiddenException(
        `Registration is closed for ${academicYear} ${semester} semester`,
      );
    }
    return status;
  }

  private assertAcademicYear(academicYear: string) {
    if (!isConsecutiveAcademicYear(academicYear)) {
      throw new BadRequestException(
        'Academic year must use consecutive years, for example 2026-2027',
      );
    }
  }
}
