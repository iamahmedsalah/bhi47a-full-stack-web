import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { PERMISSIONS } from '@student-portal/shared';
import { ControlAccessService } from './services/control-access.service';
import { ControlPetitionsService } from './services/control-petitions.service';

const chain = <T>(value: T) => {
  const c: Record<string, unknown> = {};
  c.session = () => c;
  c.select = () => c;
  c.sort = () => c;
  c.skip = () => c;
  c.limit = () => c;
  c.lean = () => Promise.resolve(value);
  return c;
};

describe('ControlPetitionsService', () => {
  const sheetId = new Types.ObjectId();
  const courseId = new Types.ObjectId();
  const student1Id = new Types.ObjectId();
  const student2Id = new Types.ObjectId();
  const controlHeadId = new Types.ObjectId().toString();
  const deanId = new Types.ObjectId().toString();

  function buildContext() {
    const storedPetitions: Array<Record<string, any>> = [];
    const storedGrades = new Map<string, Record<string, any>>([
      [
        String(student1Id),
        {
          _id: new Types.ObjectId(),
          studentId: student1Id,
          studentCode: '20260001',
          courseId,
          examType: 'midterm',
          grade: 14,
          maxGrade: 30,
          status: 'present',
          rev: 2,
          isPublished: true,
          controlApprovedRev: 2,
        },
      ],
      [
        String(student2Id),
        {
          _id: new Types.ObjectId(),
          studentId: student2Id,
          studentCode: '20260002',
          courseId,
          examType: 'midterm',
          grade: 16,
          maxGrade: 30,
          status: 'present',
          rev: 1,
          isPublished: true,
          controlApprovedRev: 1,
        },
      ],
    ]);

    const sheet = {
      _id: sheetId,
      courseId,
      courseCode: 'ECO101',
      academicYear: '2026-2027',
      semester: 'first' as const,
      component: 'midterm' as const,
      workflowState: 'APPROVED' as const,
      locked: true,
      revision: 4,
    };

    const course = {
      _id: courseId,
      code: 'ECO101',
      name: 'Principles of Economics',
      nameAr: 'مبادئ الاقتصاد',
      level: '1',
    };

    const petitionModel = {
      db: {
        startSession: jest.fn().mockResolvedValue({
          withTransaction: async (fn: () => Promise<void>) => fn(),
          endSession: jest.fn().mockResolvedValue(undefined),
        }),
      },
      find: jest.fn((filter: Record<string, any>) => {
        if (filter?.status === 'PENDING' && filter?.['items.studentId']) {
          return chain(storedPetitions.filter((p) => p.status === 'PENDING'));
        }
        return chain(storedPetitions);
      }),
      findById: jest.fn((id: string) =>
        chain(
          storedPetitions.find((p) => String(p._id) === String(id)) ?? null,
        ),
      ),
      findOne: jest.fn((filter: Record<string, any>) =>
        chain(
          storedPetitions.find(
            (p) =>
              String(p._id) === String(filter._id) &&
              (!filter.status || p.status === filter.status),
          ) ?? null,
        ),
      ),
      create: jest.fn((payload: Record<string, any>) => {
        const doc = {
          _id: new Types.ObjectId(),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...payload,
        };
        storedPetitions.push(doc);
        return Promise.resolve(doc);
      }),
      updateOne: jest.fn(
        (filter: Record<string, any>, update: Record<string, any>) => {
          const target = storedPetitions.find(
            (p) => String(p._id) === String(filter._id),
          );
          if (target && update.$set) {
            Object.assign(target, update.$set);
          }
          return Promise.resolve({ modifiedCount: target ? 1 : 0 });
        },
      ),
      countDocuments: jest.fn(() => Promise.resolve(storedPetitions.length)),
    };

    const sheetModel = {
      findById: jest.fn(() => chain(sheet)),
      updateOne: jest.fn(() => {
        sheet.revision += 1;
        return Promise.resolve({ modifiedCount: 1 });
      }),
    };

    const gradeModel = {
      find: jest.fn(() => chain([...storedGrades.values()])),
      findOneAndUpdate: jest.fn(
        (filter: Record<string, any>, update: Record<string, any>) => {
          const key = String(filter.studentId);
          const cur = storedGrades.get(key);
          const next = {
            ...(cur ?? { _id: new Types.ObjectId() }),
            ...(update.$set ?? {}),
            rev: (cur?.rev ?? 0) + (update.$inc?.rev ?? 0),
          };
          storedGrades.set(key, next);
          return chain(next);
        },
      ),
    };

    const auditModel = {
      insertMany: jest.fn().mockResolvedValue([]),
    };

    const courseModel = {
      findById: jest.fn(() => chain(course)),
    };

    const userModel = {
      find: jest.fn(() =>
        chain([
          {
            _id: student1Id,
            role: 'student',
            studentCode: '20260001',
            name: 'Student One',
            nameAr: 'طالب أول',
          },
          {
            _id: student2Id,
            role: 'student',
            studentCode: '20260002',
            name: 'Student Two',
            nameAr: 'طالب ثان',
          },
          {
            _id: new Types.ObjectId(controlHeadId),
            role: 'staff',
            name: 'Control Head',
            nameAr: 'رئيس الكنترول',
          },
          {
            _id: new Types.ObjectId(deanId),
            role: 'staff',
            name: 'Institute Dean',
            nameAr: 'عميد المعهد',
          },
        ]),
      ),
    };

    const profileModel = {
      find: jest.fn(() => chain([])),
    };

    const access = new ControlAccessService({} as never, {} as never);
    const sheets = {
      requireSheetInScope: jest.fn().mockResolvedValue({ sheet, course }),
      getRosterStudentIds: jest
        .fn()
        .mockResolvedValue(new Set([String(student1Id), String(student2Id)])),
    };
    const schemes = {
      getScheme: jest.fn().mockResolvedValue({
        version: 1,
        courseworkAttendanceMax: 5,
        courseworkQuizzesMax: 15,
        components: [
          {
            key: 'midterm',
            nameAr: 'الميدتيرم',
            nameEn: 'Midterm',
            max: 30,
            step: 0.5,
            enabled: true,
          },
        ],
      }),
      requireEnabledComponent: jest.fn().mockResolvedValue({
        key: 'midterm',
        nameAr: 'الميدتيرم',
        nameEn: 'Midterm',
        max: 30,
        step: 0.5,
        enabled: true,
      }),
      freeze: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ControlPetitionsService(
      petitionModel as never,
      sheetModel as never,
      gradeModel as never,
      auditModel as never,
      courseModel as never,
      userModel as never,
      profileModel as never,
      access,
      sheets as never,
      schemes as never,
    );

    return {
      service,
      sheet,
      storedGrades,
      storedPetitions,
      auditModel,
    };
  }

  it('creates a petition on a locked & approved sheet, blocks self-approval, and applies per-student decisions atomically', async () => {
    const ctx = buildContext();
    const controlHead = {
      _id: controlHeadId,
      role: 'staff' as const,
      name: 'Control Head',
      permissions: [
        PERMISSIONS.CONTROL_ACCESS,
        PERMISSIONS.CONTROL_PETITIONS_CREATE,
      ],
      mustChangePassword: false,
      tokenVersion: 1,
    };

    const created = await ctx.service.createPetition(controlHead, {
      sheetId: String(sheetId),
      reason: 'لجنة فحص التماسات الميدتيرم رقم ١٢',
      items: [
        {
          studentId: String(student1Id),
          proposedScore: 19,
          proposedStatus: 'present',
          studentReason: 'جمع درجات السؤال الثالث',
        },
        {
          studentId: String(student2Id),
          proposedScore: 20,
          proposedStatus: 'present',
        },
      ],
    });

    expect(created.status).toBe('PENDING');
    expect(created.counts.total).toBe(2);

    // Duplicate pending student in same sheet is rejected
    await expect(
      ctx.service.createPetition(controlHead, {
        sheetId: String(sheetId),
        reason: 'طلب مكرر',
        items: [{ studentId: String(student1Id), proposedScore: 21 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    // Self-approval by requester is forbidden even if granted approve permission
    await expect(
      ctx.service.decidePetition(
        {
          ...controlHead,
          permissions: [
            ...controlHead.permissions,
            PERMISSIONS.CONTROL_PETITIONS_APPROVE,
          ],
        },
        created.id,
        {
          items: [
            { studentId: String(student1Id), decision: 'APPROVED' },
            { studentId: String(student2Id), decision: 'APPROVED' },
          ],
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Dean approves Student 1 and rejects Student 2
    const dean = {
      _id: deanId,
      role: 'staff' as const,
      name: 'Institute Dean',
      permissions: [
        PERMISSIONS.CONTROL_ACCESS,
        PERMISSIONS.CONTROL_PETITIONS_APPROVE,
      ],
      mustChangePassword: false,
      tokenVersion: 1,
    };

    const decided = await ctx.service.decidePetition(dean, created.id, {
      reviewNote: 'تمت مراجعة كراسات الإجابة',
      items: [
        {
          studentId: String(student1Id),
          decision: 'APPROVED',
          decisionNote: 'يستحق ٣ درجات إضافية',
        },
        {
          studentId: String(student2Id),
          decision: 'REJECTED',
          decisionNote: 'الجمع مطابق ولا توجد درجات إضافية',
        },
      ],
    });

    expect(decided.status).toBe('PARTIALLY_APPROVED');
    expect(decided.counts).toMatchObject({
      total: 2,
      approved: 1,
      rejected: 1,
      pending: 0,
    });
    expect(decided.requesterSeenAt).toBeNull();

    // Student 1 grade updated automatically while preserving isPublished & syncing controlApprovedRev
    const updatedStudent1 = ctx.storedGrades.get(String(student1Id))!;
    expect(updatedStudent1.grade).toBe(19);
    expect(updatedStudent1.rev).toBe(3);
    expect(updatedStudent1.controlApprovedRev).toBe(3);
    expect(updatedStudent1.isPublished).toBe(true);

    // Student 2 grade untouched
    const unchangedStudent2 = ctx.storedGrades.get(String(student2Id))!;
    expect(unchangedStudent2.grade).toBe(16);
    expect(unchangedStudent2.rev).toBe(1);

    // Audit log recorded for both PETITION_APPROVE and PETITION_REJECT
    expect(ctx.auditModel.insertMany).toHaveBeenCalledTimes(1);
    const insertedAudits = ctx.auditModel.insertMany.mock.calls[0][0];
    expect(insertedAudits).toHaveLength(2);
    expect(insertedAudits[0].action).toBe('PETITION_APPROVE');
    expect(insertedAudits[1].action).toBe('PETITION_REJECT');

    // Control Head marks decision notification as seen
    const seen = await ctx.service.markSeen(controlHead, created.id);
    expect(seen.requesterSeenAt).not.toBeNull();
  });

  it('rejects unchanged marks in createPetition', async () => {
    const ctx = buildContext();
    const controlHead = {
      _id: controlHeadId,
      role: 'staff' as const,
      name: 'Control Head',
      permissions: [
        PERMISSIONS.CONTROL_ACCESS,
        PERMISSIONS.CONTROL_PETITIONS_CREATE,
      ],
      mustChangePassword: false,
      tokenVersion: 1,
    };

    await expect(
      ctx.service.createPetition(controlHead, {
        sheetId: String(sheetId),
        reason: 'التماس بدون تغيير درجة',
        items: [
          {
            studentId: String(student1Id),
            proposedScore: 14,
            proposedStatus: 'present',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
