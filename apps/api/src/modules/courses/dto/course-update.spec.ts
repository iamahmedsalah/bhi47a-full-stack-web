import { BadRequestException, ValidationPipe } from '@nestjs/common';
import mongoose from 'mongoose';
import {
  serializeCourseCurricula,
  type CourseCurriculum,
} from '@student-portal/shared';
import { CourseSchema } from '../schemas/course.schema';
import { CreateCourseDto, UpdateCourseDto } from './course.dto';

describe('course edit curriculum round trip', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const metadata = { type: 'body' as const, metatype: UpdateCourseDto };
  const placement: CourseCurriculum = {
    department: 'GENERAL',
    academicLevel: '1',
    semester: 'first',
    type: 'required',
  };
  const legacyPlacements = [{ ...placement, _id: '507f1f77bcf86cd799439012' }];

  describe.each([CreateCourseDto, UpdateCourseDto])(
    '%p doctor limits',
    (metatype) => {
      const course = {
        name: 'Course',
        nameAr: 'Course',
        nameEn: 'Course',
        code: 'TEST',
        level: '1',
        semester: 'first',
      };
      it.each([0, 1, 2, 3])('accepts %i doctors', async (count) => {
        const doctorIds = Array.from({ length: count }, () =>
          new mongoose.Types.ObjectId().toString(),
        );
        await expect(
          pipe.transform({ ...course, doctorIds }, { ...metadata, metatype }),
        ).resolves.toMatchObject({ doctorIds });
      });
      it('allows omitting staff assignments', async () => {
        await expect(
          pipe.transform(course, { ...metadata, metatype }),
        ).resolves.toBeInstanceOf(metatype);
      });
      it('rejects a fourth doctor', async () => {
        const doctorIds = Array.from({ length: 4 }, () =>
          new mongoose.Types.ObjectId().toString(),
        );
        await expect(
          pipe.transform({ ...course, doctorIds }, { ...metadata, metatype }),
        ).rejects.toThrow(BadRequestException);
      });
    },
  );

  it('reproduces the rejected legacy response payload', async () => {
    await expect(
      pipe.transform({ curricula: legacyPlacements }, metadata),
    ).rejects.toMatchObject({
      response: { message: ['curricula.0.property _id should not exist'] },
    });
  });

  it.each([
    { doctorIds: ['507f1f77bcf86cd799439011'] },
    { teachingAssistantIds: ['507f1f77bcf86cd799439013'] },
    { doctorIds: [], teachingAssistantIds: [] },
  ])(
    'accepts staff edits with serialized legacy placements: %j',
    async (staff) => {
      const curricula = serializeCourseCurricula(legacyPlacements);
      await expect(
        pipe.transform({ ...staff, curricula }, metadata),
      ).resolves.toMatchObject({ ...staff, curricula: [placement] });
      expect(legacyPlacements[0]._id).toBe('507f1f77bcf86cd799439012');
    },
  );

  it('keeps nested validation strict for unsupported and invalid fields', async () => {
    for (const curriculum of [
      { ...placement, unsupported: true },
      { ...placement, department: 'INVALID' },
    ]) {
      await expect(
        pipe.transform({ curricula: [curriculum] }, metadata),
      ).rejects.toThrow(BadRequestException);
    }
  });

  it('does not generate curriculum IDs in newly saved course documents', async () => {
    const CourseModel = mongoose.model(
      'CourseCurriculumRoundTrip',
      CourseSchema,
    );
    const course = new CourseModel({ curricula: legacyPlacements });
    const curricula = course.toObject().curricula;
    expect(curricula).toEqual([placement]);
    await expect(
      pipe.transform({ curricula }, metadata),
    ).resolves.toMatchObject({ curricula: [placement] });
  });
});
