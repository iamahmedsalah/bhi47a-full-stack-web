export const COURSE_LEVELS = {
  LEVEL_1: '1',
  LEVEL_2: '2',
  LEVEL_3: '3',
  LEVEL_4: '4',
} as const;

export type CourseLevel = (typeof COURSE_LEVELS)[keyof typeof COURSE_LEVELS];

export const COURSE_LEVEL_VALUES: CourseLevel[] = Object.values(COURSE_LEVELS);

export const SEMESTERS = {
  FIRST: 'first',
  SECOND: 'second',
  SUMMER: 'summer',
} as const;

export type Semester = (typeof SEMESTERS)[keyof typeof SEMESTERS];

export const SEMESTER_VALUES: Semester[] = Object.values(SEMESTERS);
