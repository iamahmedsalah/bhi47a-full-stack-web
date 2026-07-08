import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Attendance, AttendanceDocument } from './schemas/attendance.schema';
import { UpdateAttendanceDto } from './dto/attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(Attendance.name)
    private attendanceModel: Model<AttendanceDocument>,
  ) {}

  async findOne(id: string): Promise<AttendanceDocument> {
    const record = await this.attendanceModel.findById(id);
    if (!record) {
      throw new NotFoundException('سجل الحضور والغياب غير موجود'); // Record not found
    }
    return record;
  }

  async update(
    id: string,
    dto: UpdateAttendanceDto,
  ): Promise<AttendanceDocument> {
    const record = await this.findOne(id);

    const total =
      dto.totalLectures !== undefined
        ? dto.totalLectures
        : record.totalLectures;
    const attended =
      dto.attendedLectures !== undefined
        ? dto.attendedLectures
        : record.attendedLectures;
    const absence =
      dto.absenceLectures !== undefined
        ? dto.absenceLectures
        : record.absenceLectures;

    if (attended > total) {
      throw new BadRequestException(
        'Attended lectures cannot exceed total lectures',
      );
    }

    if (absence > total) {
      throw new BadRequestException(
        'Absence lectures cannot exceed total lectures',
      );
    }

    if (attended + absence > total) {
      throw new BadRequestException(
        'Attended and absence lectures cannot exceed total lectures',
      );
    }

    const percentage = total > 0 ? Math.round((attended / total) * 100) : 100;

    const updated = await this.attendanceModel.findByIdAndUpdate(
      id,
      {
        $set: {
          totalLectures: total,
          attendedLectures: attended,
          absenceLectures: absence,
          attendancePercentage: percentage,
          isPublished:
            dto.isPublished !== undefined
              ? dto.isPublished
              : record.isPublished,
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('سجل الحضور والغياب غير موجود');
    }
    return updated;
  }

  async findByStudentId(studentId: string): Promise<Attendance[]> {
    return this.attendanceModel
      .find({
        studentId: new Types.ObjectId(studentId),
        isPublished: true,
      })
      .sort({ academicYear: -1, semester: -1 })
      .lean();
  }
}
