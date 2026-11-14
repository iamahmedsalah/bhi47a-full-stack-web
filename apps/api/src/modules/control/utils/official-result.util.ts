import {
  calculateGradeScale,
  computeCourseResult,
  type ControlSchemeComponent,
  type ControlComponentMark,
} from '@student-portal/shared';

export interface ResultPolicy {
  passPercentage: number;
  finalMinimumPercentage: number;
  retake: 'latest' | 'best';
}
export const DEFAULT_RESULT_POLICY: ResultPolicy = {
  passPercentage: 50,
  finalMinimumPercentage: 0,
  retake: 'latest',
};

/** Grade thresholds use integer hundredths; no partial sum becomes an official result. */
export function evaluateOfficialResult(
  components: ControlSchemeComponent[],
  marks: Record<string, ControlComponentMark>,
  policy: ResultPolicy,
) {
  const result = computeCourseResult(components, marks);
  const withheld = components.some(
    (c) => c.enabled && marks[c.key]?.status === 'withheld',
  );
  const final = marks.final;
  // An explicitly approved incomplete final can publish its IC status once
  // other contributions are complete, without publishing a numeric outcome.
  const incomplete =
    final?.status === 'incomplete' &&
    computeCourseResult(
      components.filter((component) => component.key !== 'final'),
      marks,
    ).complete;
  const finalMax = components.find((c) => c.key === 'final')?.max ?? 0;
  if (
    !result.complete ||
    withheld ||
    !final ||
    !finalMax ||
    result.total === null
  )
    return {
      ...result,
      official: false as const,
      incomplete,
      withheld,
      passed: false,
      percentage: null,
      gradePoints: null,
      letterGrade: incomplete ? 'IC' : null,
    };
  const percentage = Math.round((result.total * 10000) / result.totalMax) / 100;
  const blocked =
    ['absent', 'banned'].includes(final.status ?? '') ||
    Math.round((final.score ?? 0) * 10000) <
      Math.round(policy.finalMinimumPercentage * finalMax * 100);
  const passed = !blocked && percentage >= policy.passPercentage;
  const scale = calculateGradeScale(
    percentage,
    passed ? 'present' : final.status === 'banned' ? 'banned' : 'absent',
  );
  return {
    ...result,
    official: true as const,
    incomplete: false,
    withheld: false,
    passed,
    percentage,
    gradePoints: scale.points,
    letterGrade: scale.letter,
  };
}
