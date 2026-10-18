import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CourseSchedule,
  CourseScheduleDocument,
} from './schemas/course-schedule.schema';
import { Course, CourseDocument } from '../courses/schemas/course.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  CreateCourseScheduleDto,
  UpdateCourseScheduleDto,
  QueryCourseScheduleDto,
} from './dto/course-schedule.dto';

const DAY_ORDER: Record<string, number> = {
  saturday: 1,
  sunday: 2,
  monday: 3,
  tuesday: 4,
  wednesday: 5,
  thursday: 6,
};

@Injectable()
export class CourseSchedulesService {
  constructor(
    @InjectModel(CourseSchedule.name)
    private readonly scheduleModel: Model<CourseScheduleDocument>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(dto: CreateCourseScheduleDto): Promise<CourseScheduleDocument> {
    let courseCode = dto.courseCode;
    let courseName = dto.courseName;
    let courseNameAr = dto.courseNameAr;
    let staffName = dto.staffName;
    let staffType = dto.staffType || 'doctor';

    if (Types.ObjectId.isValid(dto.courseId)) {
      const course = await this.courseModel.findById(dto.courseId).lean();
      if (course) {
        courseCode = courseCode || course.code;
        courseName = courseName || course.name;
        courseNameAr = courseNameAr || course.nameAr || course.name;
      }
    }

    if (Types.ObjectId.isValid(dto.staffId)) {
      const staffUser = await this.userModel.findById(dto.staffId).lean();
      if (staffUser) {
        staffName =
          staffName ||
          (staffUser as any).nameAr ||
          staffUser.name ||
          'Staff Member';
        if ((staffUser as any).staffType) {
          staffType = (staffUser as any).staffType;
        }
      }
    }

    const schedule = new this.scheduleModel({
      ...dto,
      courseId: new Types.ObjectId(dto.courseId),
      staffId: new Types.ObjectId(dto.staffId),
      courseCode: courseCode || 'COURSE',
      courseName: courseName || 'Course',
      courseNameAr: courseNameAr || courseName || 'مقرر دراسي',
      staffName: staffName || 'Staff Member',
      staffType,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
    });

    return schedule.save();
  }

  async findAll(query: QueryCourseScheduleDto): Promise<CourseSchedule[]> {
    const filter: any = {};

    if (query.staffId && Types.ObjectId.isValid(query.staffId)) {
      filter.staffId = new Types.ObjectId(query.staffId);
    }

    if (query.courseId && Types.ObjectId.isValid(query.courseId)) {
      filter.courseId = new Types.ObjectId(query.courseId);
    }

    if (query.level && query.level !== 'all') {
      filter.level = query.level;
    }

    if (query.semester && query.semester !== 'all') {
      filter.semester = query.semester;
    }

    if (query.department && query.department !== 'all') {
      filter.department = query.department;
    }

    if (query.dayOfWeek && query.dayOfWeek !== 'all') {
      filter.dayOfWeek = query.dayOfWeek;
    }

    if (query.type && query.type !== 'all') {
      filter.type = query.type;
    }

    if (query.search) {
      const s = query.search.trim();
      filter.$or = [
        { courseCode: { $regex: s, $options: 'i' } },
        { courseName: { $regex: s, $options: 'i' } },
        { courseNameAr: { $regex: s, $options: 'i' } },
        { staffName: { $regex: s, $options: 'i' } },
        { location: { $regex: s, $options: 'i' } },
        { group: { $regex: s, $options: 'i' } },
        { section: { $regex: s, $options: 'i' } },
      ];
    }

    const items = await this.scheduleModel.find(filter).lean();

    return items.sort((a, b) => {
      const dayDiff =
        (DAY_ORDER[a.dayOfWeek] || 99) - (DAY_ORDER[b.dayOfWeek] || 99);
      if (dayDiff !== 0) return dayDiff;
      return (a.startTime || '').localeCompare(b.startTime || '');
    });
  }

  async findByStaff(staffUserId: string): Promise<CourseSchedule[]> {
    if (!Types.ObjectId.isValid(staffUserId)) return [];

    const items = await this.scheduleModel
      .find({
        staffId: new Types.ObjectId(staffUserId),
        isActive: true,
      })
      .lean();

    return items.sort((a, b) => {
      const dayDiff =
        (DAY_ORDER[a.dayOfWeek] || 99) - (DAY_ORDER[b.dayOfWeek] || 99);
      if (dayDiff !== 0) return dayDiff;
      return (a.startTime || '').localeCompare(b.startTime || '');
    });
  }

  async findOne(id: string): Promise<CourseScheduleDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('الموعد غير موجود');
    }
    const item = await this.scheduleModel.findById(id);
    if (!item) {
      throw new NotFoundException('الموعد غير موجود');
    }
    return item;
  }

  async update(
    id: string,
    dto: UpdateCourseScheduleDto,
  ): Promise<CourseScheduleDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('الموعد غير موجود');
    }

    const payload: any = { ...dto };
    if (dto.courseId && Types.ObjectId.isValid(dto.courseId)) {
      payload.courseId = new Types.ObjectId(dto.courseId);
      const course = await this.courseModel.findById(dto.courseId).lean();
      if (course) {
        payload.courseCode = course.code;
        payload.courseName = course.name;
        payload.courseNameAr = course.nameAr || course.name;
      }
    }
    if (dto.staffId && Types.ObjectId.isValid(dto.staffId)) {
      payload.staffId = new Types.ObjectId(dto.staffId);
      const staffUser = await this.userModel.findById(dto.staffId).lean();
      if (staffUser) {
        payload.staffName =
          (staffUser as any).nameAr || staffUser.name || 'Staff Member';
        if ((staffUser as any).staffType) {
          payload.staffType = (staffUser as any).staffType;
        }
      }
    }

    const updated = await this.scheduleModel.findByIdAndUpdate(
      id,
      { $set: payload },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('الموعد غير موجود');
    }
    return updated;
  }

  async remove(id: string): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('الموعد غير موجود');
    }
    const deleted = await this.scheduleModel.findByIdAndDelete(id);
    if (!deleted) {
      throw new NotFoundException('الموعد غير موجود');
    }
    return { message: 'تم حذف موعد المحاضرة/السكشن بنجاح' };
  }
}
