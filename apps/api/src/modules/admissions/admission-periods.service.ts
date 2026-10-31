import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model, type FilterQuery } from 'mongoose';
import {
  admissionPeriodStatus,
  isAdmissionAcademicYear,
  type AdmissionPeriodItem,
} from '@student-portal/shared';
import {
  buildPaginationOptions,
  createPaginatedResult,
} from '../../common/utils/pagination.util';
import { normalizeSearchTerm } from '../../common/utils/search.util';
import {
  AdmissionPeriod,
  type AdmissionPeriodDocument,
} from './schemas/admission-period.schema';
import {
  CreateAdmissionPeriodDto,
  QueryAdmissionPeriodDto,
  UpdateAdmissionPeriodDto,
} from './dto/admission-period.dto';

function failure(code: string, message: string) {
  return { code, message };
}

@Injectable()
export class AdmissionPeriodsService {
  constructor(
    @InjectModel(AdmissionPeriod.name)
    private readonly periods: Model<AdmissionPeriodDocument>,
  ) {}

  private view(
    period: AdmissionPeriod & { _id: Types.ObjectId },
  ): AdmissionPeriodItem {
    return {
      _id: String(period._id),
      code: period.code,
      academicYear: period.academicYear,
      name: period.name,
      nameAr: period.nameAr,
      opensAt: period.opensAt.toISOString(),
      closesAt: period.closesAt.toISOString(),
      isEnabled: period.isEnabled,
      revision: period.revision,
      status: admissionPeriodStatus(period),
      createdAt: period.createdAt?.toISOString(),
      updatedAt: period.updatedAt?.toISOString(),
    };
  }

  private window(
    opensAt: string | Date | undefined,
    closesAt: string | Date | undefined,
  ) {
    const opens = opensAt ? new Date(opensAt) : null;
    const closes = closesAt ? new Date(closesAt) : null;
    if (
      !opens ||
      !closes ||
      !Number.isFinite(opens.getTime()) ||
      !Number.isFinite(closes.getTime()) ||
      closes <= opens
    ) {
      throw new BadRequestException(
        failure(
          'ADMISSION_PERIOD_WINDOW',
          'The closing time must be later than the opening time.',
        ),
      );
    }
    return { opensAt: opens, closesAt: closes };
  }

  async list(query: QueryAdmissionPeriodDto) {
    const { page, limit, skip } = buildPaginationOptions(query);
    const filter: FilterQuery<AdmissionPeriodDocument> = {};
    if (query.search?.trim()) {
      const search = normalizeSearchTerm(query.search);
      filter.$or = ['code', 'name', 'nameAr', 'academicYear'].map((field) => ({
        [field]: { $regex: search, $options: 'i' },
      }));
    }
    const [items, total] = await Promise.all([
      this.periods
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.periods.countDocuments(filter),
    ]);
    return createPaginatedResult(
      items.map((period) => this.view(period)),
      total,
      page,
      limit,
    );
  }

  async create(dto: CreateAdmissionPeriodDto, actorId: string) {
    if (!isAdmissionAcademicYear(dto.academicYear))
      throw new BadRequestException(
        failure(
          'ADMISSION_PERIOD_YEAR',
          'Use two consecutive academic years in YYYY-YYYY format.',
        ),
      );
    if (!dto.name || dto.name.trim().length < 2)
      throw new BadRequestException(
        failure('ADMISSION_PERIOD_NAME', 'A period name is required.'),
      );
    const window = this.window(dto.opensAt, dto.closesAt);
    try {
      const period = await this.periods.create({
        code: dto.code,
        academicYear: dto.academicYear,
        name: dto.name,
        nameAr: dto.nameAr || undefined,
        ...window,
        isEnabled: dto.isEnabled ?? false,
        revision: 0,
        history: [
          {
            actorId: new Types.ObjectId(actorId),
            at: new Date(),
            revision: 0,
            changes: {
              code: dto.code,
              academicYear: dto.academicYear,
              name: dto.name,
              nameAr: dto.nameAr,
              ...window,
              isEnabled: dto.isEnabled ?? false,
            },
          },
        ],
      });
      return this.view(period);
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 11000
      )
        throw new ConflictException(
          failure(
            'ADMISSION_PERIOD_CODE_TAKEN',
            'This intake reference already exists.',
          ),
        );
      throw error;
    }
  }

  async update(id: string, dto: UpdateAdmissionPeriodDto, actorId: string) {
    const current = await this.periods.findById(id).lean();
    if (!current)
      throw new NotFoundException(
        failure('ADMISSION_PERIOD_NOT_FOUND', 'Admission period not found.'),
      );
    if (current.revision !== dto.revision)
      throw new ConflictException(
        failure(
          'ADMISSION_PERIOD_CHANGED',
          'This period was changed by another user. Reload it before saving.',
        ),
      );
    const window = this.window(
      dto.opensAt ?? current.opensAt,
      dto.closesAt ?? current.closesAt,
    );
    const changes = {
      ...window,
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
      ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
    };
    const updated = await this.periods
      .findOneAndUpdate(
        { _id: id, revision: dto.revision },
        {
          $set: changes,
          $inc: { revision: 1 },
          $push: {
            history: {
              actorId: new Types.ObjectId(actorId),
              at: new Date(),
              revision: dto.revision + 1,
              changes,
            },
          },
        },
        { new: true, runValidators: true },
      )
      .lean();
    if (!updated)
      throw new ConflictException(
        failure(
          'ADMISSION_PERIOD_CHANGED',
          'This period was changed by another user. Reload it before saving.',
        ),
      );
    return this.view(updated);
  }
}
