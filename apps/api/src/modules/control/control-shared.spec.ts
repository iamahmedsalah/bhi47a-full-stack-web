import {
  computeCourseResult,
  normalizeMarkText,
  parseMarkInput,
  validateMark,
} from '@student-portal/shared';

describe('control mark parsing and validation', () => {
  it('normalizes Arabic-Indic digits and the Arabic decimal separator', () => {
    expect(normalizeMarkText('١٧٫٥')).toBe('17.5');
    expect(normalizeMarkText('۱۸')).toBe('18');
    expect(parseMarkInput('١٧٫٥')).toEqual({ ok: true, value: 17.5 });
    expect(parseMarkInput('17,5')).toEqual({ ok: true, value: 17.5 });
  });

  it('keeps blank, zero and text apart', () => {
    expect(parseMarkInput('')).toEqual({ ok: true, value: null });
    expect(parseMarkInput(null)).toEqual({ ok: true, value: null });
    expect(parseMarkInput('0')).toEqual({ ok: true, value: 0 });
    expect(parseMarkInput('abc')).toEqual({
      ok: false,
      reason: 'not_a_number',
    });
    expect(parseMarkInput('1e3')).toEqual({
      ok: false,
      reason: 'not_a_number',
    });
    expect(parseMarkInput('-')).toEqual({ ok: true, value: null });
    expect(parseMarkInput('-3')).toEqual({ ok: true, value: -3 });
  });

  it('validates against max and step without float errors', () => {
    const rules = { max: 20, step: 0.5 };
    expect(validateMark(0, rules)).toBeNull();
    expect(validateMark(17.5, rules)).toBeNull();
    expect(validateMark(20, rules)).toBeNull();
    expect(validateMark(20.5, rules)).toBe('above_max');
    expect(validateMark(-1, rules)).toBe('negative');
    expect(validateMark(17.3, rules)).toBe('off_step');
    expect(validateMark(1.234, rules)).toBe('too_many_decimals');
    expect(validateMark(0.3, { max: 20, step: 0.1 })).toBeNull();
    expect(validateMark(Number.NaN, rules)).toBe('not_a_number');
  });
});

describe('computeCourseResult', () => {
  const components = [
    { key: 'coursework' as const, max: 20, enabled: true },
    { key: 'midterm' as const, max: 20, enabled: true },
    { key: 'final' as const, max: 60, enabled: true },
  ];

  it('sums enabled components only when all are entered', () => {
    const result = computeCourseResult(components, {
      coursework: { status: 'present', score: 18 },
      midterm: { status: 'present', score: 18.5 },
      final: { status: 'present', score: 50 },
    });
    expect(result.complete).toBe(true);
    expect(result.total).toBe(86.5);
    expect(result.totalMax).toBe(100);
  });

  it('shows incomplete instead of a partial sum', () => {
    const result = computeCourseResult(components, {
      coursework: { status: 'present', score: 18 },
      midterm: { status: 'present', score: 18.5 },
    });
    expect(result.complete).toBe(false);
    expect(result.total).toBeNull();
  });

  it('counts absent as zero but excused as not complete', () => {
    const absent = computeCourseResult(components, {
      coursework: { status: 'present', score: 10 },
      midterm: { status: 'absent', score: null },
      final: { status: 'present', score: 30 },
    });
    expect(absent.total).toBe(40);

    const excused = computeCourseResult(components, {
      coursework: { status: 'present', score: 10 },
      midterm: { status: 'excused', score: null },
      final: { status: 'present', score: 30 },
    });
    expect(excused.complete).toBe(false);
    expect(excused.total).toBeNull();
  });

  it('does not treat a missing record as zero', () => {
    const result = computeCourseResult(components, {
      coursework: { status: 'present', score: 0 },
      midterm: { status: null, score: null },
      final: { status: 'present', score: 0 },
    });
    expect(result.complete).toBe(false);
  });
});
