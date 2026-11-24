/**
 * Control (الكنترول) module shared contracts: grading components, mark
 * validation and the pure course-result computation used by both API and web.
 *
 * Marks stay plain numbers with at most two decimals (matching the existing
 * `grades` collection). All comparisons are done on integer hundredths so that
 * floating point never decides whether a value is valid.
 */

export const CONTROL_COMPONENT_KEYS = ['coursework', 'midterm', 'final'] as const;
export type ControlComponentKey = (typeof CONTROL_COMPONENT_KEYS)[number];

/** Components that may be enabled and edited in the current delivery phase. */
export const CONTROL_ENABLED_COMPONENT_KEYS: readonly ControlComponentKey[] = [
  'coursework',
  'midterm',
  'final',
];

export interface ControlSchemeComponent {
  key: ControlComponentKey;
  nameAr: string;
  nameEn: string;
  /** Maximum mark (admin-controlled). */
  max: number;
  /** Smallest accepted increment, for example 0.5 or 0.25. */
  step: number;
  enabled: boolean;
}

export const DEFAULT_CONTROL_COMPONENTS: readonly ControlSchemeComponent[] = [
  {
    key: 'coursework',
    nameAr: 'أعمال السنة',
    nameEn: 'Coursework',
    max: 20,
    step: 1,
    enabled: true,
  },
  {
    key: 'midterm',
    nameAr: 'ميدتيرم',
    nameEn: 'Midterm',
    max: 30,
    step: 1,
    enabled: true,
  },
  {
    key: 'final',
    nameAr: 'النهائي',
    nameEn: 'Final',
    max: 50,
    step: 1,
    enabled: true,
  },
];

export const CONTROL_MIDTERM_STATES = ['present', 'absent', 'banned'] as const;

/** Grade states that only users holding `control.states.manage` may set. */
export const CONTROL_RESTRICTED_STATES = [
  'banned',
  'excused',
  'withheld',
  'incomplete',
] as const;

/** States that carry no mark (the stored `grade` is 0 and ignored). */
export const CONTROL_SCORELESS_STATES = [
  'absent',
  'banned',
  'excused',
  'incomplete',
] as const;

const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;

/** Converts Arabic-Indic digits and Arabic separators to ASCII. */
export function normalizeMarkText(raw: string): string {
  let out = '';
  for (const ch of raw.trim()) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) {
      out += String(code - ARABIC_INDIC_ZERO);
    } else if (
      code >= EXTENDED_ARABIC_INDIC_ZERO &&
      code <= EXTENDED_ARABIC_INDIC_ZERO + 9
    ) {
      out += String(code - EXTENDED_ARABIC_INDIC_ZERO);
    } else if (ch === '٫' || ch === '،' || ch === ',') {
      out += '.';
    } else if (!/\s/.test(ch)) {
      out += ch;
    }
  }
  return out;
}

export type MarkParseResult =
  | { ok: true; value: number | null }
  | { ok: false; reason: 'not_a_number' };

/** Parses a typed/pasted cell. Blank means "not entered", never 0. */
export function parseMarkInput(raw: unknown): MarkParseResult {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw === 'number') {
    return Number.isFinite(raw)
      ? { ok: true, value: raw }
      : { ok: false, reason: 'not_a_number' };
  }
  if (typeof raw !== 'string') return { ok: false, reason: 'not_a_number' };
  const text = normalizeMarkText(raw);
  if (text === '' || text === '—' || text === '-') {
    return { ok: true, value: null };
  }
  if (!/^-?\d+(\.\d+)?$/.test(text)) return { ok: false, reason: 'not_a_number' };
  return { ok: true, value: Number(text) };
}

export type MarkValidationError =
  | 'not_a_number'
  | 'negative'
  | 'above_max'
  | 'off_step'
  | 'too_many_decimals';

const toHundredths = (n: number): number => Math.round(n * 100);

/** Validates a mark against a component's max/step. Returns null when valid. */
export function validateMark(
  value: number,
  rules: { max: number; step: number },
): MarkValidationError | null {
  if (!Number.isFinite(value)) return 'not_a_number';
  if (value < 0) return 'negative';
  const scaled = toHundredths(value);
  if (Math.abs(scaled - value * 100) > 1e-6) return 'too_many_decimals';
  if (scaled > toHundredths(rules.max)) return 'above_max';
  const step = toHundredths(rules.step);
  if (step > 0 && scaled % step !== 0) return 'off_step';
  return null;
}

export interface ControlComponentMark {
  /** `null` status means no record exists yet (not entered). */
  status: string | null;
  score: number | null;
}

export interface ComputedComponentResult {
  key: string;
  max: number;
  status: string | null;
  value: number | null;
  entered: boolean;
}

export interface ComputedCourseResult {
  components: ComputedComponentResult[];
  total: number | null;
  totalMax: number;
  complete: boolean;
}

/**
 * Pure course result. If any enabled component is missing (or deferred as
 * excused/incomplete) the total is `null` and `complete` is false: a partial
 * sum is never shown as a final total.
 */
export function computeCourseResult(
  components: ReadonlyArray<
    Pick<ControlSchemeComponent, 'key' | 'max' | 'enabled'>
  >,
  marks: Partial<Record<string, ControlComponentMark | undefined>>,
): ComputedCourseResult {
  const enabled = components.filter((c) => c.enabled);
  let totalHundredths = 0;
  let complete = enabled.length > 0;
  let totalMaxHundredths = 0;

  const results: ComputedComponentResult[] = enabled.map((component) => {
    totalMaxHundredths += toHundredths(component.max);
    const mark = marks[component.key];
    const status = mark?.status ?? null;

    let value: number | null = null;
    if (status === 'present' || status === 'withheld') {
      value = mark?.score ?? null;
    } else if (status === 'absent' || status === 'banned') {
      value = 0;
    }

    if (value === null) {
      complete = false;
    } else {
      totalHundredths += toHundredths(value);
    }

    return {
      key: component.key,
      max: component.max,
      status,
      value,
      entered: value !== null,
    };
  });

  return {
    components: results,
    total: complete ? totalHundredths / 100 : null,
    totalMax: totalMaxHundredths / 100,
    complete,
  };
}

/** Awarded attendance and quiz contributions, together out of twenty. */
export function computeCoursework(attendance: number, quizzes: number): number | null {
  if (validateMark(attendance, { max: 20, step: 0.01 }) ||
      validateMark(quizzes, { max: 20, step: 0.01 })) return null;
  const hundredths = Math.round(attendance * 100) + Math.round(quizzes * 100);
  return hundredths <= 2000 ? hundredths / 100 : null;
}

export const CONTROL_WORKFLOW_STATES = [
  'DRAFT',
  'IN_REVIEW',
  'PENDING_APPROVAL',
  'RETURNED',
  'APPROVED',
  'PARTIAL_OPEN',
] as const;
export type ControlWorkflowState = (typeof CONTROL_WORKFLOW_STATES)[number];

export const CONTROL_PARTIAL_PHASES = [
  'EDITING',
  'PENDING_APPROVAL',
  'RETURNED',
] as const;
export type ControlPartialPhase = (typeof CONTROL_PARTIAL_PHASES)[number];
