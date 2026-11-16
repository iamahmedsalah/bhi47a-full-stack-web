import { curriculumDepartmentLabel } from '@student-portal/shared';
import {
  courseForDepartment,
  coursesForDepartment,
  normalizeDepartment,
} from './course-curriculum.util';
import type { CourseDocument } from '../schemas/course.schema';

describe('course-curriculum.util', () => {
  it.each([
    ['BIS', 'نظم معلومات الأعمال', 'Business Information Systems'],
    ['ACCOUNTING', 'المحاسبة والمراجعة', 'Accounting and Auditing'],
    ['GENERAL', 'شعبة عامة', 'General Division'],
  ])(
    'displays canonical bilingual labels for %s and legacy values',
    (code, ar, en) => {
      expect(curriculumDepartmentLabel(code, 'ar')).toBe(ar);
      expect(curriculumDepartmentLabel(code, 'en')).toBe(en);
      expect(curriculumDepartmentLabel(ar, 'en')).toBe(en);
      expect(curriculumDepartmentLabel(en, 'ar')).toBe(ar);
    },
  );
  describe('normalizeDepartment', () => {
    it.each([
      ['نظم معلومات الأعمال', 'BIS'],
      ['Business Information Systems', 'BIS'],
      ['المحاسبة والمراجعة', 'ACCOUNTING'],
      ['Accounting and Auditing', 'ACCOUNTING'],
      ['شعبة عامة', 'GENERAL'],
      ['General Division', 'GENERAL'],
    ])('accepts the renamed department %s for imports', (label, code) => {
      expect(normalizeDepartment(label)).toBe(code);
    });
    it('normalizes various Accounting strings to ACCOUNTING', () => {
      expect(normalizeDepartment('ACCOUNTING')).toBe('ACCOUNTING');
      expect(normalizeDepartment('accounting')).toBe('ACCOUNTING');
      expect(normalizeDepartment('ACCOUNTANT')).toBe('ACCOUNTING');
      expect(normalizeDepartment('المحاسبة والتمويل')).toBe('ACCOUNTING');
      expect(normalizeDepartment('المحاسبة والمراجعة')).toBe('ACCOUNTING');
      expect(normalizeDepartment('قسم المحاسبة')).toBe('ACCOUNTING');
      expect(normalizeDepartment('محاسبة')).toBe('ACCOUNTING');
    });

    it('normalizes various BIS strings to BIS', () => {
      expect(normalizeDepartment('BIS')).toBe('BIS');
      expect(normalizeDepartment('bis')).toBe('BIS');
      expect(normalizeDepartment('BUSINESS INFORMATION SYSTEMS')).toBe('BIS');
      expect(normalizeDepartment('نظم معلومات الأعمال')).toBe('BIS');
      expect(normalizeDepartment('قسم نظم معلومات الأعمال')).toBe('BIS');
    });

    it('normalizes General strings to GENERAL', () => {
      expect(normalizeDepartment('GENERAL')).toBe('GENERAL');
      expect(normalizeDepartment('عام')).toBe('GENERAL');
      expect(normalizeDepartment('الشعبة العامة')).toBe('GENERAL');
    });

    it('returns undefined for empty or unknown inputs', () => {
      expect(normalizeDepartment('')).toBeUndefined();
      expect(normalizeDepartment(undefined)).toBeUndefined();
      expect(normalizeDepartment('UNKNOWN_TRACK')).toBeUndefined();
    });
  });

  describe('Course 326 dual-semester placement', () => {
    const course326 = {
      code: '326',
      name: 'Governmental Accounting',
      nameAr: 'المحاسبة في الوحدات الحكومية',
      nameEn: 'Governmental Accounting',
      academicLevel: '3',
      level: '3',
      semester: 'second',
      department: 'BIS',
      type: 'elective',
      creditHours: 3,
      isActive: true,
    } as unknown as CourseDocument;

    it('places Course 326 in the FIRST semester for Accounting students', () => {
      const resolved = courseForDepartment(course326, 'ACCOUNTING');
      expect(resolved).not.toBeNull();
      expect(resolved?.code).toBe('326');
      expect(resolved?.academicLevel).toBe('3');
      expect(resolved?.semester).toBe('first');
      expect(resolved?.offeredTerms).toEqual(['first']);
      expect(resolved?.type).toBe('elective');
      expect(resolved?.department).toBe('ACCOUNTING');
    });

    it('places Course 326 in the SECOND semester for BIS students', () => {
      const resolved = courseForDepartment(course326, 'BIS');
      expect(resolved).not.toBeNull();
      expect(resolved?.code).toBe('326');
      expect(resolved?.academicLevel).toBe('3');
      expect(resolved?.semester).toBe('second');
      expect(resolved?.offeredTerms).toEqual(['second']);
      expect(resolved?.type).toBe('elective');
      expect(resolved?.department).toBe('BIS');
    });
  });

  describe('Shared Level 3 courses and track filtering', () => {
    const mockCourses = [
      // Shared Level 3
      {
        code: '317',
        academicLevel: '3',
        level: '3',
        semester: 'first',
        department: 'BIS',
        type: 'required',
        isActive: true,
      },
      {
        code: '411',
        academicLevel: '3',
        level: '3',
        semester: 'first',
        department: 'BIS',
        type: 'required',
        isActive: true,
      },
      // BIS-only Level 3
      {
        code: 'S11',
        academicLevel: '3',
        level: '3',
        semester: 'first',
        department: 'BIS',
        type: 'required',
        isActive: true,
      },
      // Accounting-only Level 3
      {
        code: 'A11',
        academicLevel: '3',
        level: '3',
        semester: 'first',
        department: 'ACCOUNTING',
        type: 'required',
        isActive: true,
      },
      // General Level 1
      {
        code: '112',
        academicLevel: '1',
        level: '1',
        semester: 'first',
        department: 'GENERAL',
        type: 'required',
        isActive: true,
      },
    ] as unknown as CourseDocument[];

    it('includes shared courses and BIS courses, but excludes Accounting-specific courses for a BIS student', () => {
      const bisCourses = coursesForDepartment(mockCourses, 'BIS');
      const codes = bisCourses.map((c) => c.code);

      expect(codes).toContain('112'); // General
      expect(codes).toContain('317'); // Shared
      expect(codes).toContain('411'); // Shared
      expect(codes).toContain('S11'); // BIS
      expect(codes).not.toContain('A11'); // Excluded Accounting
    });

    it('includes shared courses and Accounting courses, but excludes BIS-specific courses for an Accounting student', () => {
      const accCourses = coursesForDepartment(mockCourses, 'ACCOUNTING');
      const codes = accCourses.map((c) => c.code);

      expect(codes).toContain('112'); // General
      expect(codes).toContain('317'); // Shared
      expect(codes).toContain('411'); // Shared
      expect(codes).toContain('A11'); // Accounting
      expect(codes).not.toContain('S11'); // Excluded BIS
    });
  });
});
