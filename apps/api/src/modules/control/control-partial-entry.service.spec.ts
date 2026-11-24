import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { PERMISSIONS } from '@student-portal/shared';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import { ControlAccessService } from './services/control-access.service';
import { ControlGradesService } from './services/control-grades.service';
import { ControlPartialEntryService } from './services/control-partial-entry.service';
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

function makeStaff(
  id: string,
  permissions: string[],
  role: 'staff' | 'admin' = 'staff',
): AuthenticatedUser {
  return {
    _id: id,
    role,
    name: 'Control Staff',
    permissions: [PERMISSIONS.CONTROL_ACCESS, ...permissions],
    mustChangePassword: false,
    tokenVersion: 1,
  };
}

describe('ControlPartialEntryService & Coexistence', () => {
  const sheetId = new Types.ObjectId();
  const courseId = new Types.ObjectId();
  const approvedStudentId = new Types.ObjectId();
  const zeroScoreStudentId = new Types.ObjectId();
  const unenteredStudentId = new Types.ObjectId();
  const blockedStudentId = new Types.ObjectId();
  const controlHeadId = new Types.ObjectId().toString();
  const deanId = new Types.ObjectId().toString();

  function buildHarness(options?: { activePointer?: boolean }) {
    const audits: Array<Record<string, any>> = [];
    const petitions: Array<Record<string, any>> = [];
    const outbox: Array<Record<string, any>> = [];
    const releases: Array<Record<string, any>> = [];
    const pointers = new Map<string, Record<string, any>>();
    if (options?.activePointer) {
      pointers.set(String(sheetId), {
        _id: sheetId,
        releaseId: new Types.ObjectId(),
        active: true,
        scope: {
          courseId,
          academicYear: '2026-2027',
          semester: 'first',
          component: 'midterm',
        },
      });
    }

    const course = {
      _id: courseId,
      code: 'CS201',
      name: 'Algorithms',
      nameAr: 'الخوارزميات',
      level: '2',
    };

    const sheet: Record<string, any> = {
      _id: sheetId,
      courseId,
      courseCode: 'CS201',
      academicYear: '2026-2027',
      semester: 'first',
      component: 'midterm',
      workflowState: 'APPROVED',
      locked: false,
      revision: 3,
      partialCycle: null,
      unenteredStudentIds: [String(unenteredStudentId)],
      tuitionDeferredStudentIds: [String(blockedStudentId)],
    };

    const gradesMap = new Map<string, Record<string, any>>([
      [
        String(approvedStudentId),
        {
          _id: new Types.ObjectId(),
          studentId: approvedStudentId,
          studentCode: '260001',
          courseId,
          courseCode: 'CS201',
          academicYear: '2026-2027',
          semester: 'first',
          examType: 'midterm',
          grade: 22,
          maxGrade: 30,
          status: 'present',
          rev: 2,
          controlApprovedRev: 2,
          isPublished: Boolean(options?.activePointer),
          controlManaged: true,
          cleared: false,
        },
      ],
      [
        String(zeroScoreStudentId),
        {
          _id: new Types.ObjectId(),
          studentId: zeroScoreStudentId,
          studentCode: '260002',
          courseId,
          courseCode: 'CS201',
          academicYear: '2026-2027',
          semester: 'first',
          examType: 'midterm',
          grade: 0,
          maxGrade: 30,
          status: 'present',
          rev: 1,
          controlApprovedRev: 1,
          isPublished: Boolean(options?.activePointer),
          controlManaged: true,
          cleared: false,
        },
      ],
    ]);

    const users = [
      {
        _id: approvedStudentId,
        role: 'student',
        studentCode: '260001',
        name: 'Approved Student',
        nameAr: 'طالب معتمد',
      },
      {
        _id: zeroScoreStudentId,
        role: 'student',
        studentCode: '260002',
        name: 'Zero Score Student',
        nameAr: 'طالب صفر',
      },
      {
        _id: unenteredStudentId,
        role: 'student',
        studentCode: '260003',
        name: 'Excused Unentered',
        nameAr: 'طالب غير مرصود',
      },
      {
        _id: blockedStudentId,
        role: 'student',
        studentCode: '260004',
        name: 'Blocked Student',
        nameAr: 'طالب محجوب',
      },
    ];

    const profiles = [
      {
        userId: blockedStudentId,
        isBlocked: true,
        tuitionFeesStatus: 'unpaid',
      },
    ];

    const session = {
      withTransaction: async (fn: () => Promise<unknown>) => fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };

    const registrationDocs = users.map((u) => ({
      studentId: u._id,
      courses: ['CS201'],
    }));

    const collectionMock = (name: string) => ({
      findOne: jest.fn((filter: Record<string, any>) => {
        if (name === 'control_release_pointers') {
          return Promise.resolve(pointers.get(String(filter._id)) ?? null);
        }
        return Promise.resolve(null);
      }),
      find: jest.fn((filter?: Record<string, any>) => {
        if (name === 'course_registrations') {
          return {
            batchSize: () => ({
              toArray: () => Promise.resolve(registrationDocs),
            }),
          };
        }
        if (name === 'grades') {
          const all = [...gradesMap.values()];
          return {
            sort: () => ({
              batchSize: () => ({
                toArray: () => Promise.resolve(all),
              }),
            }),
            toArray: () => Promise.resolve(all),
          };
        }
        if (name === 'control_sheets') {
          return { toArray: () => Promise.resolve([sheet]) };
        }
        if (name === 'control_grading_schemes') {
          return { toArray: () => Promise.resolve([]) };
        }
        if (name === 'control_result_policies') {
          return { toArray: () => Promise.resolve([]) };
        }
        void filter;
        return { toArray: () => Promise.resolve([]) };
      }),
      insertOne: jest.fn((doc: Record<string, any>) => {
        if (name === 'control_releases') releases.push(doc);
        return Promise.resolve({ insertedId: doc._id });
      }),
      insertMany: jest.fn((docs: Array<Record<string, any>>) => {
        if (name === 'control_release_outbox') outbox.push(...docs);
        return Promise.resolve({ insertedCount: docs.length });
      }),
      replaceOne: jest.fn((filter: Record<string, any>, doc: any) => {
        if (name === 'control_release_pointers') {
          pointers.set(String(filter._id), { _id: filter._id, ...doc });
        }
        return Promise.resolve({ matchedCount: 1 });
      }),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
      updateMany: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    });

    const mongoDb = {
      createCollection: jest.fn().mockResolvedValue(undefined),
      collection: jest.fn((name: string) => ({
        ...collectionMock(name),
        createIndex: jest.fn().mockResolvedValue(undefined),
      })),
    };

    const dbMock = {
      startSession: jest.fn().mockResolvedValue(session),
      db: mongoDb,
      createCollection: mongoDb.createCollection,
      models: {
        Grade: { collection: { name: 'grades' } },
        ControlSheet: { collection: { name: 'control_sheets' } },
        GradeAuditLog: { collection: { name: 'grade_audit_logs' } },
        GradingScheme: { collection: { name: 'control_grading_schemes' } },
        CourseRegistration: { collection: { name: 'course_registrations' } },
      },
      collection: mongoDb.collection,
    };

    const sheetModel = {
      db: dbMock,
      findById: jest.fn(() => chain(sheet)),
      updateOne: jest.fn(
        (filter: Record<string, any>, update: Record<string, any>) => {
          if (
            filter.workflowState &&
            sheet.workflowState !== filter.workflowState
          ) {
            return Promise.resolve({ matchedCount: 0 });
          }
          if (filter.locked !== undefined && sheet.locked !== filter.locked) {
            return Promise.resolve({ matchedCount: 0 });
          }
          if (
            filter.revision !== undefined &&
            sheet.revision !== filter.revision
          ) {
            return Promise.resolve({ matchedCount: 0 });
          }
          if (
            filter['partialCycle.revision'] !== undefined &&
            sheet.partialCycle?.revision !== filter['partialCycle.revision']
          ) {
            return Promise.resolve({ matchedCount: 0 });
          }
          if (update.$set) {
            for (const [k, v] of Object.entries(update.$set)) {
              if (k.startsWith('partialCycle.')) {
                const sub = k.slice('partialCycle.'.length);
                sheet.partialCycle = {
                  ...(sheet.partialCycle ?? {}),
                  [sub]: v,
                };
              } else {
                sheet[k] = v;
              }
            }
          }
          if (update.$unset) {
            for (const k of Object.keys(update.$unset)) {
              if (k.startsWith('partialCycle.') && sheet.partialCycle) {
                delete sheet.partialCycle[k.slice('partialCycle.'.length)];
              }
            }
          }
          if (update.$inc) {
            for (const [k, v] of Object.entries(update.$inc)) {
              if (k === 'revision') sheet.revision += Number(v);
              if (k === 'partialCycle.revision' && sheet.partialCycle) {
                sheet.partialCycle.revision += Number(v);
              }
            }
          }
          return Promise.resolve({ matchedCount: 1, modifiedCount: 1 });
        },
      ),
    };

    const gradeModel = {
      db: dbMock,
      find: jest.fn((filter: Record<string, any>) => {
        const list = [...gradesMap.values()].filter((g) => {
          if (filter.studentId?.$in) {
            return filter.studentId.$in.some(
              (id: Types.ObjectId) => String(id) === String(g.studentId),
            );
          }
          return true;
        });
        return chain(list);
      }),
      findOne: jest.fn((filter: Record<string, any>) =>
        chain(gradesMap.get(String(filter.studentId)) ?? null),
      ),
      findOneAndUpdate: jest.fn(
        (filter: Record<string, any>, update: Record<string, any>) => {
          const sid = String(filter.studentId);
          const cur = gradesMap.get(sid);
          if (filter.rev !== undefined) {
            const expectedMatch =
              typeof filter.rev === 'number'
                ? cur?.rev === filter.rev
                : filter.rev?.$in?.includes(cur?.rev ?? 0);
            if (!expectedMatch && cur) return chain(null);
          }
          const next = {
            ...(cur ?? { _id: new Types.ObjectId(), rev: 0 }),
            ...(update.$set ?? {}),
            rev: (cur?.rev ?? 0) + (update.$inc?.rev ?? 0),
          };
          if (update.$unset) {
            for (const k of Object.keys(update.$unset)) delete next[k];
          }
          gradesMap.set(sid, next);
          return chain(next);
        },
      ),
      updateMany: jest.fn(
        (
          filter: Record<string, any>,
          update: Array<Record<string, any>> | Record<string, any>,
        ) => {
          const idSet = new Set(
            (filter._id?.$in ?? []).map((id: Types.ObjectId) => String(id)),
          );
          const pipelineSet = Array.isArray(update)
            ? update[0]?.$set
            : update.$set;
          for (const g of gradesMap.values()) {
            if (!idSet.has(String(g._id))) continue;
            if (pipelineSet) {
              for (const [k, v] of Object.entries(pipelineSet)) {
                if (k === 'controlApprovedRev') {
                  g.controlApprovedRev = g.rev ?? 0;
                } else {
                  g[k] = v;
                }
              }
            }
          }
          return Promise.resolve({ modifiedCount: idSet.size });
        },
      ),
    };

    const userModel = {
      find: jest.fn((filter?: Record<string, any>) => {
        if (filter?._id?.$in) {
          const ids = new Set(filter._id.$in.map(String));
          return chain(users.filter((u) => ids.has(String(u._id))));
        }
        return chain(users);
      }),
    };

    const profileModel = {
      find: jest.fn((filter?: Record<string, any>) => {
        if (filter?.isBlocked) {
          return chain(profiles.filter((p) => p.isBlocked));
        }
        return chain(profiles);
      }),
    };

    const auditModel = {
      find: jest.fn(() => chain([])),
      create: jest.fn((docs: Array<Record<string, any>>) => {
        audits.push(...docs);
        return Promise.resolve(docs);
      }),
      insertMany: jest.fn((docs: Array<Record<string, any>>) => {
        audits.push(...docs);
        return Promise.resolve(docs);
      }),
    };

    const petitionModel = {
      db: dbMock,
      find: jest.fn(() =>
        chain(petitions.filter((p) => p.status === 'PENDING')),
      ),
      findById: jest.fn((id: string) =>
        chain(petitions.find((p) => String(p._id) === String(id)) ?? null),
      ),
      findOne: jest.fn((filter: Record<string, any>) =>
        chain(
          petitions.find((p) => String(p._id) === String(filter._id)) ?? null,
        ),
      ),
      create: jest.fn((payload: Record<string, any>) => {
        const doc = { _id: new Types.ObjectId(), ...payload };
        petitions.push(doc);
        return Promise.resolve(doc);
      }),
      updateOne: jest.fn(
        (filter: Record<string, any>, update: Record<string, any>) => {
          const target = petitions.find(
            (p) => String(p._id) === String(filter._id),
          );
          if (target && update.$set) Object.assign(target, update.$set);
          return Promise.resolve({ modifiedCount: target ? 1 : 0 });
        },
      ),
    };

    const access = new ControlAccessService(
      { exists: () => chain({ _id: courseId }) } as never,
      { exists: () => chain({ _id: new Types.ObjectId() }) } as never,
    );
    const sheetsService = {
      requireSheetInScope: jest.fn().mockResolvedValue({ sheet, course }),
      getRosterStudentIds: jest.fn(
        (
          _code: string,
          _year: string,
          _sem: string,
          subset?: Types.ObjectId[],
        ) => {
          const full = new Set(users.map((u) => String(u._id)));
          if (!subset) return Promise.resolve(full);
          return Promise.resolve(
            new Set(subset.map(String).filter((id) => full.has(id))),
          );
        },
      ),
      getSheet: jest.fn(() =>
        Promise.resolve({
          sheet: {
            id: String(sheet._id),
            workflowState: sheet.workflowState,
            revision: sheet.revision,
            partialCycle: sheet.partialCycle,
          },
          course,
        }),
      ),
    };
    const scheme = {
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
    };
    const schemesService = {
      getScheme: jest.fn().mockResolvedValue(scheme),
      requireEnabledComponent: jest
        .fn()
        .mockResolvedValue(scheme.components[0]),
      freeze: jest.fn().mockResolvedValue(undefined),
    };

    const partialService = new ControlPartialEntryService(
      sheetModel as never,
      gradeModel as never,
      userModel as never,
      profileModel as never,
      auditModel as never,
      access,
      sheetsService as never,
      schemesService as never,
      { approve: jest.fn().mockResolvedValue(undefined) } as never,
    );

    const gradesService = new ControlGradesService(
      gradeModel as never,
      { findById: jest.fn(() => chain(course)) } as never,
      userModel as never,
      sheetModel as never,
      auditModel as never,
      access,
      sheetsService as never,
      schemesService as never,
      profileModel as never,
    );

    const petitionsService = new ControlPetitionsService(
      petitionModel as never,
      sheetModel as never,
      gradeModel as never,
      auditModel as never,
      { findById: jest.fn(() => chain(course)) } as never,
      userModel as never,
      profileModel as never,
      access,
      sheetsService as never,
      schemesService as never,
    );

    return {
      partialService,
      gradesService,
      petitionsService,
      sheet,
      gradesMap,
      audits,
      outbox,
      releases,
    };
  }

  it('lists only NULL unentered candidates (excluding 0-score and approved students) and completes selective entry lifecycle', async () => {
    const h = buildHarness({ activePointer: true });
    const controlHead = makeStaff(controlHeadId, [
      PERMISSIONS.CONTROL_SHEETS_VIEW,
      PERMISSIONS.CONTROL_SHEETS_REOPEN,
      PERMISSIONS.CONTROL_GRADES_ENTER,
      PERMISSIONS.CONTROL_SHEETS_SUBMIT,
      PERMISSIONS.CONTROL_PETITIONS_CREATE,
    ]);
    const dean = makeStaff(deanId, [
      PERMISSIONS.CONTROL_SHEETS_VIEW,
      PERMISSIONS.CONTROL_SHEETS_APPROVE,
      PERMISSIONS.CONTROL_SHEETS_REVIEW,
      PERMISSIONS.CONTROL_PETITIONS_APPROVE,
    ]);

    // 1. Candidates exclude 22-score AND 0-score students
    const candRes = await h.partialService.listCandidates(
      controlHead,
      String(sheetId),
      false,
    );
    expect(candRes.candidates.map((c) => c.studentId)).toEqual([
      String(unenteredStudentId),
      String(blockedStudentId),
    ]);
    expect(candRes.candidates[1].tuitionBlocked).toBe(true);

    // 2. Opening partial entry for blocked student is forbidden
    await expect(
      h.partialService.openPartial(controlHead, String(sheetId), {
        studentIds: [String(blockedStudentId)],
        expectedRevision: 3,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // 3. Opening partial entry for 0-score approved student is conflicted
    await expect(
      h.partialService.openPartial(controlHead, String(sheetId), {
        studentIds: [String(zeroScoreStudentId)],
        expectedRevision: 3,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    // 4. Open partial cycle for unentered excused student
    await h.partialService.openPartial(controlHead, String(sheetId), {
      studentIds: [String(unenteredStudentId)],
      reason: 'عذر طبي معتمد من شؤون الطلاب',
      expectedRevision: 3,
    });
    expect(h.sheet.workflowState).toBe('PARTIAL_OPEN');
    expect(h.sheet.partialCycle).toMatchObject({
      phase: 'EDITING',
      revision: 0,
      allowedStudentIds: [String(unenteredStudentId)],
    });

    // 5. Reject editing approved student (and zero-score student) during PARTIAL_OPEN
    const editRes = await h.gradesService.applyChanges(
      controlHead,
      String(sheetId),
      {
        expectedSchemeVersion: 1,
        changes: [
          {
            studentId: String(approvedStudentId),
            score: 29,
            status: 'present',
            expectedRev: 2,
            opId: 'op-reject-approved',
          },
          {
            studentId: String(unenteredStudentId),
            score: 21,
            status: 'present',
            expectedRev: 0,
            opId: 'op-allow-excused',
          },
        ],
      },
    );
    expect(editRes.summary).toEqual({
      ok: 1,
      invalid: 0,
      conflict: 0,
      forbidden: 1,
    });
    expect(editRes.results[0].code).toBe('not_in_partial_cycle');
    expect(h.gradesMap.get(String(approvedStudentId))!.grade).toBe(22);
    const draftGrade = h.gradesMap.get(String(unenteredStudentId))!;
    expect(draftGrade.grade).toBe(21);
    expect(draftGrade.isPublished).toBe(false);
    expect(draftGrade.controlApprovedRev).toBeUndefined();
    // allowedStudentIds stays fixed across saves
    expect(h.sheet.partialCycle.allowedStudentIds).toEqual([
      String(unenteredStudentId),
    ]);

    // 6. Reject petition on draft grade or partial-cycle student, allow petition on original approved student concurrently
    await expect(
      h.petitionsService.createPetition(controlHead, {
        sheetId: String(sheetId),
        reason: 'محاولة التماس على مسودة',
        items: [{ studentId: String(unenteredStudentId), proposedScore: 25 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const petition = await h.petitionsService.createPetition(controlHead, {
      sheetId: String(sheetId),
      reason: 'التماس درجة معتمدة بالتوازي',
      items: [{ studentId: String(approvedStudentId), proposedScore: 24 }],
    });
    await h.petitionsService.decidePetition(dean, petition.id, {
      items: [{ studentId: String(approvedStudentId), decision: 'APPROVED' }],
    });
    expect(h.gradesMap.get(String(approvedStudentId))!.grade).toBe(24);
    expect(h.gradesMap.get(String(approvedStudentId))!.controlApprovedRev).toBe(
      3,
    );

    // 7. Submit partial marks -> locks editing during PENDING_APPROVAL
    await h.partialService.submitPartial(controlHead, String(sheetId), {
      expectedPartialRevision: h.sheet.partialCycle.revision,
    });
    expect(h.sheet.partialCycle.phase).toBe('PENDING_APPROVAL');

    await expect(
      h.gradesService.applyChanges(controlHead, String(sheetId), {
        expectedSchemeVersion: 1,
        changes: [
          {
            studentId: String(unenteredStudentId),
            score: 23,
            status: 'present',
            expectedRev: 1,
            opId: 'op-blocked-pending',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    // 8. Return for review -> reopens editing ONLY for allowed student
    await h.partialService.returnPartial(dean, String(sheetId), {
      expectedPartialRevision: h.sheet.partialCycle.revision,
      reason: 'مراجعة درجة السكشن',
    });
    expect(h.sheet.partialCycle.phase).toBe('RETURNED');

    const revisedEdit = await h.gradesService.applyChanges(
      controlHead,
      String(sheetId),
      {
        expectedSchemeVersion: 1,
        changes: [
          {
            studentId: String(unenteredStudentId),
            score: 25,
            status: 'present',
            expectedRev: 1,
            opId: 'op-revised-partial',
          },
        ],
      },
    );
    expect(revisedEdit.summary.ok).toBe(1);

    // 9. Submit again & prevent self-approval
    await h.partialService.submitPartial(controlHead, String(sheetId), {
      expectedPartialRevision: h.sheet.partialCycle.revision,
    });

    const selfApproveUser = makeStaff(controlHeadId, [
      PERMISSIONS.CONTROL_SHEETS_APPROVE,
    ]);
    await expect(
      h.partialService.approvePartial(selfApproveUser, String(sheetId), {
        expectedPartialRevision: h.sheet.partialCycle.revision,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // 10. Dean approves -> publishes ONLY new student mark, closes cycle, notifies only new student
    const revBeforeApproveOriginal = h.gradesMap.get(
      String(approvedStudentId),
    )!.rev;
    await h.partialService.approvePartial(dean, String(sheetId), {
      expectedPartialRevision: h.sheet.partialCycle.revision,
      reason: 'اعتماد العميد للدرجة الجديدة',
    });

    expect(h.sheet.workflowState).toBe('APPROVED');
    expect(h.sheet.partialCycle).toBeNull();
    expect(h.gradesMap.get(String(approvedStudentId))!.rev).toBe(
      revBeforeApproveOriginal,
    );
    const approvedPartialMark = h.gradesMap.get(String(unenteredStudentId))!;
    expect(approvedPartialMark.grade).toBe(25);
    expect(approvedPartialMark.controlApprovedRev).toBe(2);
    expect(approvedPartialMark.isPublished).toBe(true);
    expect(h.outbox.map((o) => String(o.studentId))).toEqual([
      String(unenteredStudentId),
    ]);
    expect(h.audits.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'PARTIAL_OPEN',
        'CREATE',
        'PETITION_APPROVE',
        'PARTIAL_SUBMIT',
        'PARTIAL_RETURN',
        'UPDATE',
        'PARTIAL_APPROVE',
      ]),
    );
  });

  it('rejects petition on an unapproved draft grade when sheet is not in partial cycle', async () => {
    const h = buildHarness();
    // Put sheet back to DRAFT with a draft grade (no controlApprovedRev)
    h.sheet.workflowState = 'DRAFT';
    h.gradesMap.set(String(unenteredStudentId), {
      _id: new Types.ObjectId(),
      studentId: unenteredStudentId,
      studentCode: '260003',
      courseId,
      examType: 'midterm',
      grade: 18,
      status: 'present',
      rev: 1,
      isPublished: false,
      cleared: false,
    });
    const staff = makeStaff(controlHeadId, [
      PERMISSIONS.CONTROL_PETITIONS_CREATE,
    ]);
    await expect(
      h.petitionsService.createPetition(staff, {
        sheetId: String(sheetId),
        reason: 'التماس على مسودة',
        items: [{ studentId: String(unenteredStudentId), proposedScore: 20 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
