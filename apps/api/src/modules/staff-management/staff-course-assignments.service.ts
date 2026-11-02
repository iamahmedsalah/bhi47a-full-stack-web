import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type ClientSession, type Model } from 'mongoose';
import { Course, type CourseDocument } from '../courses/schemas/course.schema';
import {
  courseStaffFilter,
  isTeachingStaff,
} from '../courses/utils/course-staff.util';

interface Member {
  _id: Types.ObjectId;
  name: string;
  nameAr?: string;
  role?: string;
  staffType?: string;
  titlePrefix?: string;
}
interface Assignment {
  _id: Types.ObjectId;
  name: string;
  nameAr?: string;
  staffType?: string;
  titlePrefix?: string;
}

@Injectable()
export class StaffCourseAssignmentsService {
  constructor(
    @InjectModel(Course.name) private readonly courses: Model<CourseDocument>,
  ) {}

  async sync(staff: Member, courseIds: string[], session: ClientSession) {
    if (
      courseIds.length &&
      (staff.role !== 'staff' || !isTeachingStaff(staff.staffType))
    ) {
      throw new BadRequestException(
        'Courses may only be assigned to teaching staff',
      );
    }
    const id = String(staff._id);
    const selected = new Set(courseIds);
    const courses = await this.courses
      .find({
        $or: [
          { _id: { $in: courseIds.map((value) => new Types.ObjectId(value)) } },
          courseStaffFilter(id),
        ],
      })
      .session(session)
      .lean();
    if (
      courseIds.some(
        (value) => !courses.some((course) => String(course._id) === value),
      )
    ) {
      throw new BadRequestException(
        'One or more selected courses do not exist',
      );
    }
    for (const course of courses) {
      // Normalize existing scalar/array assignments without dropping other faculty.
      const collect = (
        ids: Types.ObjectId[],
        members: Assignment[],
        singles: Types.ObjectId[] = [],
        fallback?: Assignment,
      ) => {
        const map = new Map<string, Assignment>();
        for (const member of members ?? []) map.set(String(member._id), member);
        for (const value of [...(ids ?? []), ...singles]) {
          const key = String(value);
          if (!map.has(key))
            map.set(
              key,
              fallback && String(fallback._id) === key
                ? fallback
                : { _id: new Types.ObjectId(key), name: '' },
            );
        }
        map.delete(id);
        return map;
      };
      const doctors = collect(
        course.doctorIds,
        course.doctors,
        course.doctorId ? [course.doctorId] : [],
        course.doctorId
          ? {
              _id: course.doctorId,
              name: course.doctorName || '',
              nameAr: course.doctorNameAr,
            }
          : undefined,
      );
      const assistants = collect(
        course.teachingAssistantIds,
        course.teachingAssistants,
        [course.teachingAssistantId, course.teachingAssistant].filter(
          (value): value is Types.ObjectId => Boolean(value),
        ),
      );
      if (selected.has(String(course._id))) {
        const member = {
          _id: staff._id,
          name: staff.name,
          nameAr: staff.nameAr,
          staffType: staff.staffType,
          titlePrefix:
            staff.staffType === 'doctor' ? staff.titlePrefix : undefined,
        };
        (staff.staffType === 'doctor' ? doctors : assistants).set(id, member);
      }
      if (doctors.size > 2)
        throw new BadRequestException('A course can have at most two doctors');
      const doctorList = [...doctors.values()];
      const assistantList = [...assistants.values()];
      await this.courses.updateOne(
        { _id: course._id },
        {
          $set: {
            doctorIds: doctorList.map((member) => member._id),
            doctors: doctorList,
            doctorId: doctorList[0]?._id ?? null,
            doctorName:
              doctorList
                .map((member) => member.name)
                .filter(Boolean)
                .join(' / ') || null,
            doctorNameAr:
              doctorList
                .map((member) => member.nameAr || member.name)
                .filter(Boolean)
                .join(' / ') || null,
            teachingAssistantIds: assistantList.map((member) => member._id),
            teachingAssistants: assistantList,
          },
          $unset: { teachingAssistantId: 1, teachingAssistant: 1 },
        },
        { session },
      );
    }
  }
}
