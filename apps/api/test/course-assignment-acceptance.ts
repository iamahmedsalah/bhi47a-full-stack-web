import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { PERMISSIONS } from '@student-portal/shared';
import * as bcrypt from 'bcrypt';
import mongoose, { Types, type Model } from 'mongoose';
import request from 'supertest';
import {
  Course,
  CourseSchema,
} from '../src/modules/courses/schemas/course.schema';
import { courseStaffFilter } from '../src/modules/courses/utils/course-staff.util';
import type { UserDocument } from '../src/modules/users/schemas/user.schema';

export function defineCourseAssignmentAcceptance(context: {
  app: () => INestApplication;
  users: () => Model<UserDocument>;
  origin: () => string;
  accounts: Map<string, { userId: string; identifier: string }>;
  ids: string[];
  password: string;
}) {
  it('preserves all teaching assignments across edits and fresh connections; revokes explicit removals', async () => {
    const { accounts, password, ids } = context;
    const app = context.app();
    const users = context.users();
    const db = users.db.db!;
    const courseIds: Types.ObjectId[] = [];
    const quizIds: Types.ObjectId[] = [];
    async function login(email: string) {
      const response = await request(app.getHttpServer())
        .post('/api/auth/admin/login')
        .set('Origin', context.origin())
        .send({ email, password })
        .expect(200);
      return {
        cookie: (response.headers['set-cookie'] as unknown as string[])
          .map((value) => value.split(';')[0])
          .join('; '),
        csrf: response.body.csrfToken as string,
      };
    }
    const admin = await login(accounts.get('admin')!.identifier);
    const patch = (id: Types.ObjectId, body: object) =>
      request(app.getHttpServer())
        .patch(`/api/admin/courses/${String(id)}`)
        .set('Origin', context.origin())
        .set('Cookie', admin.cookie)
        .set('x-csrf-token', admin.csrf)
        .send(body)
        .expect(200);
    try {
      for (const [index, staffType] of [
        'doctor',
        'teaching_assistant',
        'assistant_lecturer',
      ].entries()) {
        const staffId = new Types.ObjectId();
        const email = `assignment-${String(staffId)}@example.test`;
        await users.create({
          _id: staffId,
          name: 'Synthetic teaching staff',
          email,
          role: 'staff',
          staffType,
          passwordHash: await bcrypt.hash(password, 4),
          isActive: true,
          mustChangePassword: false,
          permissions: [
            PERMISSIONS.QUIZZES_READ,
            PERMISSIONS.QUIZZES_WRITE,
            PERMISSIONS.COURSES_READ,
          ],
        });
        ids.push(String(staffId));
        const courseId = new Types.ObjectId();
        courseIds.push(courseId);
        // Exercise embedded IDs and pre-array string references through real Mongoose queries.
        const legacyAssignment =
          index === 0
            ? { doctorId: String(staffId) }
            : index === 1
              ? {
                  teachingAssistantId: String(staffId),
                  teachingAssistant: staffId,
                }
              : {
                  teachingAssistants: [
                    { _id: String(staffId), name: 'Legacy staff' },
                  ],
                };
        await db.collection('courses').insertOne({
          _id: courseId,
          code: `AS${String(courseId)}`,
          name: 'Assigned course',
          isActive: true,
          doctorIds: [],
          teachingAssistantIds: [],
          ...legacyAssignment,
        });
        const staff = await login(email);
        const managerCourses = () =>
          request(app.getHttpServer())
            .get('/api/admin/courses')
            .query({ staffId: String(staffId), page: 1, limit: 100 })
            .set('Cookie', admin.cookie)
            .expect(200);
        expect(
          (await managerCourses()).body.items.map(
            (course: { _id: string }) => course._id,
          ),
        ).toEqual([String(courseId)]);
        await request(app.getHttpServer())
          .get('/api/admin/courses')
          .query({
            staffId: String(staffId),
            page: 1,
            limit: 100,
            _t: Date.now(),
          })
          .set('Cookie', admin.cookie)
          .expect(400);
        const assigned = () =>
          request(app.getHttpServer())
            .get('/api/staff/me/assigned-courses')
            .set('Cookie', staff.cookie)
            .expect(200);
        const own = await assigned();
        expect(own.body.map((course: { _id: string }) => course._id)).toContain(
          String(courseId),
        );
        const list = await request(app.getHttpServer())
          .get('/api/admin/courses')
          .query({ staffId: accounts.get('admin')!.userId })
          .set('Cookie', staff.cookie)
          .expect(200);
        expect(
          list.body.items.map((course: { _id: string }) => course._id),
        ).toEqual([String(courseId)]);
        const created = await request(app.getHttpServer())
          .post('/api/admin/quizzes')
          .set('Origin', context.origin())
          .set('Cookie', staff.cookie)
          .set('x-csrf-token', staff.csrf)
          .send({
            courseId: String(courseId),
            title: 'Teaching defaults',
            durationMinutes: 15,
            endsAt: new Date(Date.now() + 3600000).toISOString(),
            questions: [
              {
                id: 'q1',
                text: 'One?',
                type: 'mcq',
                options: ['1', '2'],
                correctOptionIndex: 0,
                points: 1,
              },
            ],
          })
          .expect(201);
        quizIds.push(new Types.ObjectId(created.body._id as string));
        expect(created.body).toMatchObject({
          resultsReleaseMode: 'after_close',
          reviewReleaseMode: 'manual',
          publishResults: false,
          allowReview: false,
        });
        await patch(courseId, { name: 'Renamed without changing assignments' });
        expect(
          (await managerCourses()).body.items.map(
            (course: { _id: string }) => course._id,
          ),
        ).toEqual([String(courseId)]);
        expect(
          (await assigned()).body.map((course: { _id: string }) => course._id),
        ).toContain(String(courseId));
        // A separate DB connection has no service memory or cached assignments.
        const fresh = await mongoose
          .createConnection(process.env.MONGODB_URI!, { maxPoolSize: 1 })
          .asPromise();
        try {
          const model = fresh.model(Course.name, CourseSchema);
          expect(
            await model.countDocuments({
              _id: courseId,
              ...courseStaffFilter(String(staffId)),
            }),
          ).toBe(1);
        } finally {
          await fresh.close();
        }
        await patch(courseId, {
          doctorIds: [String(staffId)],
          teachingAssistantIds: [String(staffId)],
        });
        expect((await assigned()).body).toHaveLength(1);
        await patch(courseId, { doctorIds: [], teachingAssistantIds: [] });
        expect((await assigned()).body).toHaveLength(0);
        const persisted = await app
          .get<Model<unknown>>(getModelToken(Course.name))
          .findById(courseId)
          .lean();
        expect(persisted).not.toHaveProperty('teachingAssistantId');
        expect(persisted).not.toHaveProperty('teachingAssistant');
        await request(app.getHttpServer())
          .post('/api/admin/quizzes')
          .set('Origin', context.origin())
          .set('Cookie', staff.cookie)
          .set('x-csrf-token', staff.csrf)
          .send({
            courseId: String(courseId),
            title: 'Revoked',
            durationMinutes: 15,
            questions: [],
          })
          .expect(403);
      }
      await request(app.getHttpServer())
        .get('/api/staff/me/assigned-courses')
        .expect(401);
    } finally {
      await db.collection('quizzes').deleteMany({ _id: { $in: quizIds } });
      await db.collection('courses').deleteMany({ _id: { $in: courseIds } });
    }
  }, 60000);
}
