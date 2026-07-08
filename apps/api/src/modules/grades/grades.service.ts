import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Grade, GradeDocument } from './schemas/grade.schema';
import { CourseQuiz, CourseQuizDocument } from './schemas/course-quiz.schema';
import { SaveGradeDto, QueryGradeDto, PublishGradesDto } from './dto/grade.dto';
import {
  buildPaginationOptions,
  createPaginatedResult,
} from '../../common/utils/pagination.util';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Course, CourseDocument } from '../courses/schemas/course.schema';

@Injectable()
export class GradesService {
  constructor(
    @InjectModel(Grade.name) private gradeModel: Model<GradeDocument>,
    @InjectModel(CourseQuiz.name)
    private courseQuizModel: Model<CourseQuizDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
  ) {}

  async saveGrade(dto: SaveGradeDto): Promise<GradeDocument> {
    // 1. Resolve student (user)
    const student = await this.userModel.findOne({
      studentCode: dto.studentCode,
      role: 'student',
    });
    if (!student) {
      throw new NotFoundException('الطالب غير موجود'); // Student not found
    }

    // 2. Resolve course
    const course = await this.courseModel.findOne({
      code: dto.courseCode.toUpperCase(),
    });
    if (!course) {
      throw new NotFoundException('المادة غير موجودة'); // Course not found
    }

    const filter = {
      studentCode: dto.studentCode,
      courseCode: dto.courseCode.toUpperCase(),
      examType: dto.examType,
    };

    const updateData = {
      studentId: student._id,
      courseId: course._id,
      courseName: course.name,
      courseCode: course.code,
      grade: dto.grade,
      maxGrade: dto.maxGrade,
      status: dto.status || 'present',
      academicYear: dto.academicYear,
      semester: dto.semester,
      isPublished: dto.isPublished !== undefined ? dto.isPublished : true,
    };

    // Upsert (insert or update)
    return this.gradeModel.findOneAndUpdate(
      filter,
      { $set: updateData },
      { new: true, upsert: true },
    ) as any;
  }

  async findAll(query: QueryGradeDto) {
    const { page, limit, skip } = buildPaginationOptions(query);
    const filter: any = {};

    if (query.studentCode) {
      filter.studentCode = query.studentCode;
    }

    if (query.courseCode) {
      filter.courseCode = query.courseCode.toUpperCase();
    }

    if (query.examType) {
      filter.examType = query.examType;
    }

    if (query.isPublished !== undefined) {
      filter.isPublished = query.isPublished;
    }

    if (query.status) {
      filter.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.gradeModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('studentId', 'name')
        .lean(),
      this.gradeModel.countDocuments(filter),
    ]);

    // Map items to include student name directly for convenience
    const formattedItems = items.map((item: any) => ({
      ...item,
      studentName: item.studentId?.name || '—',
    }));

    return createPaginatedResult(formattedItems, total, page, limit);
  }

  async findOne(id: string): Promise<GradeDocument> {
    const grade = await this.gradeModel.findById(id);
    if (!grade) {
      throw new NotFoundException('الدرجة غير موجودة'); // Grade not found
    }
    return grade;
  }

  async update(id: string, updateData: Partial<Grade>): Promise<GradeDocument> {
    const updated = await this.gradeModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('الدرجة غير موجودة');
    }
    return updated;
  }

  async remove(id: string): Promise<{ message: string }> {
    const deleted = await this.gradeModel.findByIdAndDelete(id);
    if (!deleted) {
      throw new NotFoundException('الدرجة غير موجودة');
    }
    return { message: 'تم حذف الدرجة بنجاح' }; // Grade deleted successfully
  }

  async publishGrades(dto: PublishGradesDto): Promise<{ count: number }> {
    const filter: any = {
      academicYear: dto.academicYear,
      semester: dto.semester,
      examType: dto.examType,
    };

    if (dto.courseCode) {
      filter.courseCode = dto.courseCode.toUpperCase();
    }

    const result = await this.gradeModel.updateMany(filter, {
      $set: { isPublished: dto.isPublished },
    });

    return { count: result.modifiedCount };
  }

  // ─── Student Self Services ───────────────────────────────────────

  async findStudentResults(studentId: string): Promise<Grade[]> {
    return this.gradeModel
      .find({
        studentId: new Types.ObjectId(studentId),
        isPublished: true,
      })
      .sort({ courseCode: 1, examType: 1 })
      .lean();
  }

  async findStudentQuizzes(studentId: string): Promise<CourseQuiz[]> {
    return this.courseQuizModel
      .find({
        studentId: new Types.ObjectId(studentId),
        isPublished: true,
      })
      .sort({ courseCode: 1 })
      .lean();
  }
}
