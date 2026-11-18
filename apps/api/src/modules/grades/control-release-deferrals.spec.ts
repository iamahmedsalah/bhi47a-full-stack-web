import { Types } from 'mongoose';
import { DEFAULT_CONTROL_COMPONENTS } from '@student-portal/shared';
import { ControlReleaseStore } from './control-release.store';
import { ControlAttemptStore } from '../control/control-attempt.store';
import type { Connection } from 'mongoose';
import type { ControlSheet } from '../control/schemas/control-sheet.schema';

function fixture(component: 'midterm' | 'final' = 'final') {
  const courseId = new Types.ObjectId();
  const enteredId = new Types.ObjectId();
  const heldId = new Types.ObjectId();
  const scope = {
    courseId,
    academicYear: '2026-2027',
    semester: 'first' as const,
  };
  const sheets = DEFAULT_CONTROL_COMPONENTS.map((c) => ({
    ...scope,
    _id: new Types.ObjectId(),
    courseCode: '111',
    component: c.key,
    workflowState: 'APPROVED',
    tuitionDeferredStudentIds: c.key === 'coursework' ? [] : [String(heldId)],
  }));
  const marks = DEFAULT_CONTROL_COMPONENTS.flatMap((c) =>
    [enteredId, heldId]
      .filter((id) => id === enteredId || c.key === 'coursework')
      .map((studentId) => ({
        ...scope,
        _id: new Types.ObjectId(),
        studentId,
        examType: c.key,
        grade: c.max,
        maxGrade: c.max,
        status: 'present',
        rev: 1,
        controlApprovedRev: 1,
      })),
  );
  const connection = {
    models: {},
    db: {
      collection: (name: string) => ({
        findOne: () => Promise.resolve(null),
        find: () => {
          const rows =
            name === 'control_sheets'
              ? sheets
              : name === 'course_registrations'
                ? [enteredId, heldId].map((studentId) => ({ studentId }))
                : marks.filter(
                    (m) => component === 'final' || m.examType === component,
                  );
          const cursor = {
            sort: () => cursor,
            batchSize: () => cursor,
            toArray: () => Promise.resolve(rows),
          };
          return cursor;
        },
      }),
    },
  } as unknown as Connection;
  const sheet = sheets.find(
    (s) => s.component === component,
  )! as ControlSheet & { _id: Types.ObjectId };
  return {
    store: new ControlReleaseStore(connection),
    sheet,
    sheets,
    marks,
    heldId,
    enteredId,
  };
}

describe('financially deferred release entries', () => {
  beforeEach(() =>
    jest
      .spyOn(ControlAttemptStore.prototype, 'assertReviewed')
      .mockResolvedValue(undefined),
  );
  afterEach(() => jest.restoreAllMocks());

  it.each(['midterm', 'final'] as const)(
    'publishes complete %s students without inventing held marks',
    async (key) => {
      const ctx = fixture(key);
      const preview = await ctx.store.preview(ctx.sheet);
      expect(preview.count).toBe(1);
      expect(
        preview.marks.every(
          (m) => String(m.studentId) === String(ctx.enteredId),
        ),
      ).toBe(true);
      expect(
        ctx.marks.find(
          (m) => m.studentId === ctx.heldId && m.examType === 'coursework',
        )?.grade,
      ).toBe(20);
      if (key === 'final') {
        expect(preview.results).toHaveLength(1);
        expect(preview.results[0].result.total).toBe(100);
      }
    },
  );
  it('does not infer a deferral from a missing grade or publish a partial final', async () => {
    const ctx = fixture();
    ctx.sheets.find(
      (s) => s.component === 'midterm',
    )!.tuitionDeferredStudentIds = [];
    await expect(ctx.store.preview(ctx.sheet)).rejects.toThrow(
      'RESULT_INCOMPLETE',
    );
  });
  it('still requires coursework for deferred students', async () => {
    const ctx = fixture();
    ctx.marks.splice(
      ctx.marks.findIndex((m) => m.studentId === ctx.heldId),
      1,
    );
    await expect(ctx.store.preview(ctx.sheet)).rejects.toThrow(
      'RESULT_INCOMPLETE',
    );
  });
  it('keeps a previously approved financial deferral blank after the hold is lifted', async () => {
    // Approval evidence, rather than a live hold lookup, determines which blanks
    // can be omitted. A lifted hold never turns them into an official zero.
    const ctx = fixture();
    const first = await ctx.store.preview(ctx.sheet);
    const next = await ctx.store.preview(ctx.sheet);
    expect(next.digest).toBe(first.digest);
    expect(
      next.results.some((r) => String(r.studentId) === String(ctx.heldId)),
    ).toBe(false);
  });
});
