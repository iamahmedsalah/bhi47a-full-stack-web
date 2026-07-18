import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Course, CourseDocument } from './schemas/course.schema';
import {
  CreateCourseDto,
  UpdateCourseDto,
  QueryCourseDto,
} from './dto/course.dto';
import {
  buildPaginationOptions,
  createPaginatedResult,
} from '../../common/utils/pagination.util';
import { normalizeSearchTerm } from '../../common/utils/search.util';

@Injectable()
export class CoursesService {
  constructor(
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
  ) {}

  async create(dto: CreateCourseDto): Promise<CourseDocument> {
    const existing = await this.courseModel.findOne({
      code: dto.code.toUpperCase(),
    });
    if (existing) {
      throw new ConflictException('كود المادة موجود بالفعل'); // Course code already exists
    }

    const course = new this.courseModel({
      ...dto,
      code: dto.code.toUpperCase(),
      academicLevel: dto.academicLevel ?? dto.level,
      level: dto.level ?? dto.academicLevel,
      prerequisites: dto.prerequisites?.map((code) => code.toUpperCase()) ?? [],
      type: dto.type ?? 'required',
    });
    return course.save();
  }

  async findAll(query: QueryCourseDto) {
    const { page, limit, skip } = buildPaginationOptions(query);
    const filter: any = {};

    if (query.search) {
      const search = normalizeSearchTerm(query.search);
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { nameAr: { $regex: search, $options: 'i' } },
        { nameEn: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }

    if (query.level) {
      filter.level = query.level;
    }

    if (query.academicLevel) {
      filter.academicLevel = query.academicLevel;
    }

    if (query.semester) {
      filter.semester = query.semester;
    }

    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    const [items, total] = await Promise.all([
      this.courseModel
        .find(filter)
        .sort({ code: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.courseModel.countDocuments(filter),
    ]);

    return createPaginatedResult(items, total, page, limit);
  }

  async findOne(id: string): Promise<CourseDocument> {
    const course = await this.courseModel.findById(id);
    if (!course) {
      throw new NotFoundException('المادة غير موجودة'); // Course not found
    }
    return course;
  }

  async update(id: string, dto: UpdateCourseDto): Promise<CourseDocument> {
    const course = await this.findOne(id);

    if (dto.code && dto.code.toUpperCase() !== course.code) {
      const existing = await this.courseModel.findOne({
        code: dto.code.toUpperCase(),
      });
      if (existing) {
        throw new ConflictException('كود المادة موجود بالفعل');
      }
      dto.code = dto.code.toUpperCase();
    }

    if (dto.level && !dto.academicLevel) {
      dto.academicLevel = dto.level;
    }

    if (dto.academicLevel && !dto.level) {
      dto.level = dto.academicLevel;
    }

    if (dto.prerequisites) {
      dto.prerequisites = dto.prerequisites.map((code) => code.toUpperCase());
    }

    const updated = await this.courseModel.findByIdAndUpdate(
      id,
      { $set: dto },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('المادة غير موجودة');
    }
    return updated;
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findOne(id);
    await this.courseModel.findByIdAndDelete(id);
    return { message: 'تم حذف المادة بنجاح' }; // Course deleted successfully
  }
}
