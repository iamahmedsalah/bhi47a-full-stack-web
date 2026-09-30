import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  StudentAcademicProfile,
  StudentAcademicProfileDocument,
} from '../schemas/student-academic-profile.schema';
import { UpsertStudentAcademicProfileDto } from '../dto/registration.dto';
import { normalizeCourseCodes } from '../utils/course-recommendation.util';

@Injectable()
export class AcademicProfileService {
  constructor(
    @InjectModel(StudentAcademicProfile.name)
    private readonly academicProfileModel: Model<StudentAcademicProfileDocument>,
  ) {}

  async upsertAcademicProfile(dto: UpsertStudentAcademicProfileDto) {
    const update = {
      ...dto,
      completedCourses: normalizeCourseCodes(dto.completedCourses),
      failedCourses: normalizeCourseCodes(dto.failedCourses),
      lowGradeCourses: normalizeCourseCodes(dto.lowGradeCourses),
      approvedICCourseCompletions: normalizeCourseCodes(
        dto.approvedICCourseCompletions,
      ),
      studentId: new Types.ObjectId(dto.studentId),
      advisorId: dto.advisorId ? new Types.ObjectId(dto.advisorId) : undefined,
    };

    return this.academicProfileModel.findOneAndUpdate(
      { studentId: update.studentId },
      { $set: update },
      { new: true, upsert: true },
    );
  }

  async listAcademicProfiles() {
    return this.academicProfileModel
      .find()
      .populate('studentId', 'name studentCode nationalIdMasked')
      .populate('advisorId', 'name email')
      .sort({ updatedAt: -1 })
      .lean();
  }

  async getAcademicProfile(
    studentId: string,
  ): Promise<StudentAcademicProfileDocument> {
    const profile = await this.academicProfileModel.findOne({
      studentId: new Types.ObjectId(studentId),
    });
    if (!profile) {
      throw new NotFoundException('Student academic profile not found');
    }
    return profile;
  }
}
