import type { CourseLevel, Semester } from '@student-portal/shared';

/**
 * Parses a value that may be a number, a string representation of a number,
 * or an Arabic placeholder. Returns `undefined` for non-numeric or empty values.
 */
export function parseSafeNumber(val: unknown): number | undefined {
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'number') return Number.isNaN(val) ? undefined : val;
  const str =
    typeof val === 'string'
      ? val.trim()
      : typeof val === 'boolean'
        ? String(val)
        : '';
  if (
    !str ||
    str === 'محل' ||
    str === '-' ||
    str === 'N/A' ||
    str === 'null' ||
    str === 'undefined'
  ) {
    return undefined;
  }
  const parsed = Number(str);
  return Number.isNaN(parsed) ? undefined : parsed;
}

const LEVEL_ALIASES: Record<string, CourseLevel> = {
  '1': '1',
  first: '1',
  one: '1',
  '2': '2',
  second: '2',
  two: '2',
  '3': '3',
  third: '3',
  three: '3',
  '4': '4',
  fourth: '4',
  four: '4',
};

export function normalizeStudentLevel(value: unknown): CourseLevel {
  const level = (
    typeof value === 'string'
      ? value
      : typeof value === 'number'
        ? String(value)
        : '1'
  )
    .trim()
    .toLowerCase();
  return LEVEL_ALIASES[level] ?? '1';
}

export function normalizeStudentSemester(value: unknown): Semester {
  const semester = (
    typeof value === 'string'
      ? value
      : typeof value === 'number'
        ? String(value)
        : 'first'
  )
    .trim()
    .toLowerCase();
  if (semester === '2' || semester === 'second') return 'second';
  if (semester === '3' || semester === 'summer') return 'summer';
  return 'first';
}

/**
 * Normalizes raw spreadsheet header keys into canonical camelCase field names.
 *
 * Handles both English and Arabic column header variants so that importers
 * receive a consistently-keyed object regardless of which template the
 * admin used to fill in the data.
 */
export function normalizeRowKeys(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const key of Object.keys(row)) {
    const cleanKey = key
      .trim()
      .toLowerCase()
      .replace(/[\s_-]/g, '');
    const val = row[key];

    // Student Code
    if (
      cleanKey === 'studentcode' ||
      cleanKey === 'كود الطالب' ||
      cleanKey === 'الكود الأكاديمي' ||
      cleanKey === 'الكود'
    ) {
      normalized.studentCode = String(val).trim();
    }
    // Arabic Name
    else if (
      cleanKey === 'fullnamear' ||
      cleanKey === 'namear' ||
      cleanKey === 'الاسم بالعربية' ||
      cleanKey === 'اسم الطالب بالعربية' ||
      cleanKey === 'الاسم العربي'
    ) {
      normalized.fullNameAr = String(val).trim();
      if (!normalized.fullName) {
        normalized.fullName = String(val).trim();
      }
    }
    // English Name
    else if (
      cleanKey === 'fullnameen' ||
      cleanKey === 'nameen' ||
      cleanKey === 'englishname' ||
      cleanKey === 'studentnameen' ||
      cleanKey === 'الاسم بالانجليزية' ||
      cleanKey === 'الاسم بالإنجليزية' ||
      cleanKey === 'اسم الطالب بالانجليزية' ||
      cleanKey === 'اسم الطالب بالإنجليزية'
    ) {
      normalized.fullNameEn = String(val).trim();
      if (!normalized.fullName) {
        normalized.fullName = String(val).trim();
      }
    }
    // Full Name
    else if (
      cleanKey === 'fullname' ||
      cleanKey === 'name' ||
      cleanKey === 'الاسم' ||
      cleanKey === 'الاسم بالكامل' ||
      cleanKey === 'اسم الطالب'
    ) {
      normalized.fullName = String(val).trim();
    }
    // National ID
    else if (cleanKey === 'nationalid' || cleanKey === 'الرقم القومي') {
      normalized.nationalId = String(val).trim();
    }
    // Force password change
    else if (
      cleanKey === 'mustchangepassword' ||
      cleanKey === 'forcepasswordchange' ||
      cleanKey === 'تغيير كلمة المرور عند الدخول'
    ) {
      normalized.mustChangePassword = ['true', '1', 'yes', 'on'].includes(
        String(val).trim().toLowerCase(),
      );
    }
    // Level
    else if (cleanKey === 'level' || cleanKey === 'المستوى') {
      normalized.level = String(val).trim();
    }
    // Department
    else if (
      cleanKey === 'department' ||
      cleanKey === 'القسم' ||
      cleanKey === 'القسم العلمي'
    ) {
      normalized.department = String(val).trim();
    }
    // Group
    else if (cleanKey === 'group' || cleanKey === 'المجموعة') {
      normalized.group = String(val).trim();
    }
    // Section
    else if (
      cleanKey === 'section' ||
      cleanKey === 'السكشن' ||
      cleanKey === 'الشعبة'
    ) {
      normalized.section = String(val).trim();
    }
    // Academic Year
    else if (cleanKey === 'academicyear' || cleanKey === 'السنة الدراسية') {
      normalized.academicYear = String(val).trim();
    }
    // Semester
    else if (cleanKey === 'semester' || cleanKey === 'الفصل الدراسي') {
      normalized.semester = String(val).trim().toLowerCase();
    }
    // Seat Number
    else if (cleanKey === 'seatnumber' || cleanKey === 'رقم الجلوس') {
      normalized.seatNumber = String(val).trim();
    }
    // Exam Room
    else if (
      cleanKey === 'examroom' ||
      cleanKey === 'رقم اللجنة' ||
      cleanKey === 'اللجنة'
    ) {
      normalized.examRoom = String(val).trim();
    }
    // Exam Floor
    else if (cleanKey === 'examfloor' || cleanKey === 'الدور') {
      normalized.examFloor = String(val).trim();
    }
    // Exam Building
    else if (cleanKey === 'exambuilding' || cleanKey === 'المبنى') {
      normalized.examBuilding = String(val).trim();
    }
    // Course Code
    else if (
      cleanKey === 'coursecode' ||
      cleanKey === 'كود المادة' ||
      cleanKey === 'كود المقرر' ||
      cleanKey === 'رمز المادة' ||
      cleanKey === 'رمز المقرر' ||
      cleanKey === 'code'
    ) {
      normalized.courseCode = String(val).trim().toUpperCase();
    }
    // Course Name
    else if (
      cleanKey === 'coursename' ||
      cleanKey === 'اسم المادة' ||
      cleanKey === 'المادة' ||
      cleanKey === 'اسم المقرر' ||
      cleanKey === 'المقرر' ||
      cleanKey === 'name'
    ) {
      normalized.courseName = String(val).trim();
    } else if (
      cleanKey === 'coursenamear' ||
      cleanKey === 'arabicname' ||
      cleanKey === 'اسم المادة بالعربية' ||
      cleanKey === 'اسم المقرر بالعربية' ||
      cleanKey === 'namear'
    ) {
      normalized.courseNameAr = String(val).trim();
    } else if (
      cleanKey === 'coursenameen' ||
      cleanKey === 'englishname' ||
      cleanKey === 'اسم المادة بالإنجليزية' ||
      cleanKey === 'اسم المقرر بالإنجليزية' ||
      cleanKey === 'nameen'
    ) {
      normalized.courseNameEn = String(val).trim();
    } else if (
      cleanKey === 'description' ||
      cleanKey === 'الوصف' ||
      cleanKey === 'وصف المقرر'
    ) {
      normalized.description = String(val).trim();
    } else if (
      cleanKey === 'registrationpriority' ||
      cleanKey === 'أولوية التسجيل' ||
      cleanKey === 'الأولوية'
    ) {
      normalized.registrationPriority = parseSafeNumber(val);
    } else if (
      cleanKey === 'prerequisites' ||
      cleanKey === 'prerequisitecodes' ||
      cleanKey === 'المتطلبات السابقة' ||
      cleanKey === 'المتطلب السابق'
    ) {
      normalized.prerequisites = String(val)
        .split(/[,;،]/)
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean);
    } else if (
      cleanKey === 'corequisites' ||
      cleanKey === 'corequisitecodes' ||
      cleanKey === 'المتطلبات المتزامنة' ||
      cleanKey === 'المتطلب المتزامن'
    ) {
      normalized.coRequisites = String(val)
        .split(/[,;،]/)
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean);
    } else if (
      cleanKey === 'equivalentcourses' ||
      cleanKey === 'equivalentcoursecodes' ||
      cleanKey === 'المقررات المعادلة' ||
      cleanKey === 'المقرر المعادل'
    ) {
      normalized.equivalentCourses = String(val)
        .split(/[,;،]/)
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean);
    } else if (
      cleanKey === 'offeredterms' ||
      cleanKey === 'availableterms' ||
      cleanKey === 'فصول الطرح'
    ) {
      const termMap: Record<string, string> = {
        first: 'first',
        '1': 'first',
        أول: 'first',
        الاول: 'first',
        الأول: 'first',
        second: 'second',
        '2': 'second',
        ثاني: 'second',
        الثاني: 'second',
        summer: 'summer',
        '3': 'summer',
        صيفي: 'summer',
        الصيفي: 'summer',
      };
      normalized.offeredTerms = String(val)
        .split(/[,;،]/)
        .map((term) => {
          const clean = term.trim().toLowerCase();
          return termMap[clean] || clean;
        })
        .filter(Boolean);
    } else if (
      cleanKey === 'type' ||
      cleanKey === 'coursetype' ||
      cleanKey === 'نوع المقرر' ||
      cleanKey === 'نوع المادة'
    ) {
      normalized.courseType = String(val).trim().toLowerCase();
    } else if (
      cleanKey === 'programcurricula' ||
      cleanKey === 'departmentcurricula'
    ) {
      normalized.programCurricula = String(val).trim();
    } else if (
      cleanKey === 'recommendedsemester' ||
      cleanKey === 'الفصل الموصى به'
    ) {
      normalized.recommendedSemester = parseSafeNumber(val);
    } else if (cleanKey === 'minimumgpa' || cleanKey === 'الحد الأدنى للمعدل') {
      normalized.minimumGpa = parseSafeNumber(val);
    }
    // Credit Hours
    else if (
      cleanKey === 'credithours' ||
      cleanKey === 'الساعات' ||
      cleanKey === 'الساعات المعتمدة'
    ) {
      normalized.creditHours = parseSafeNumber(val);
    }
    // Max Grade (Checked first to avoid prefix collisions)
    else if (
      cleanKey === 'maxgrade' ||
      cleanKey === 'maxscore' ||
      cleanKey === 'الدرجةالعظمى' ||
      cleanKey === 'الدرجةالقصوى' ||
      cleanKey === 'العظمى' ||
      cleanKey === 'أقصىدرجة'
    ) {
      normalized.maxGrade = parseSafeNumber(val);
    }
    // Grade Value
    else if (
      cleanKey === 'grade' ||
      cleanKey === 'score' ||
      cleanKey === 'الدرجة' ||
      cleanKey === 'درجة' ||
      cleanKey === 'الدرجةالمحققة'
    ) {
      normalized.grade = parseSafeNumber(val);
    }
    // Midterm breakdown
    else if (
      cleanKey === 'midterm' ||
      cleanKey === 'ميدترم' ||
      cleanKey === 'امتحانالميدترم' ||
      cleanKey === 'نصفي'
    ) {
      normalized.midterm = parseSafeNumber(val);
    }
    // Final breakdown
    else if (
      cleanKey === 'final' ||
      cleanKey === 'نهائي' ||
      cleanKey === 'الامتحانالنهائي' ||
      cleanKey === 'فاينل'
    ) {
      normalized.final = parseSafeNumber(val);
    }
    // Coursework breakdown
    else if (
      cleanKey === 'coursework' ||
      cleanKey === 'أعمالالسنة' ||
      cleanKey === 'اعمالالسنة' ||
      cleanKey === 'أعمالسنة' ||
      cleanKey === 'سنة'
    ) {
      normalized.coursework = parseSafeNumber(val);
    }
    // Practical breakdown
    else if (
      cleanKey === 'practical' ||
      cleanKey === 'عملي' ||
      cleanKey === 'شفوي' ||
      cleanKey === 'الامتحانالعملي'
    ) {
      normalized.practical = parseSafeNumber(val);
    }
    // Total Score
    else if (
      cleanKey === 'total' ||
      cleanKey === 'totalscore' ||
      cleanKey === 'المجموع' ||
      cleanKey === 'المجموعالكلي' ||
      cleanKey === 'الدرجةالكلية'
    ) {
      normalized.total = parseSafeNumber(val);
    } else if (cleanKey === 'maxmidterm') {
      normalized.maxMidterm = parseSafeNumber(val);
    } else if (cleanKey === 'maxfinal') {
      normalized.maxFinal = parseSafeNumber(val);
    } else if (cleanKey === 'maxcoursework') {
      normalized.maxCoursework = parseSafeNumber(val);
    } else if (cleanKey === 'maxpractical') {
      normalized.maxPractical = parseSafeNumber(val);
    }
    // Exam Type
    else if (
      cleanKey === 'examtype' ||
      cleanKey === 'نوعالامتحان' ||
      cleanKey === 'نوعالاختبار'
    ) {
      normalized.examType = String(val).trim().toLowerCase();
    }

    // Quiz Number
    else if (cleanKey === 'quiznumber' || cleanKey === 'رقم الكويز') {
      normalized.quizNumber = parseSafeNumber(val);
    }
    // Quiz Title
    else if (
      cleanKey === 'title' ||
      cleanKey === 'عنوان الكويز' ||
      cleanKey === 'اسم الكويز'
    ) {
      normalized.title = String(val).trim();
    }
    // Attendance Stats
    else if (
      cleanKey === 'totallectures' ||
      cleanKey === 'المحاضرات الكلية' ||
      cleanKey === 'عدد المحاضرات'
    ) {
      normalized.totalLectures = Number(val);
    } else if (
      cleanKey === 'attendedlectures' ||
      cleanKey === 'المحاضرات الحاضرة' ||
      cleanKey === 'حضور'
    ) {
      normalized.attendedLectures = Number(val);
    } else if (
      cleanKey === 'absencelectures' ||
      cleanKey === 'المحاضرات الغائبة' ||
      cleanKey === 'غياب'
    ) {
      normalized.absenceLectures = Number(val);
    }
    // Academic Email
    else if (
      cleanKey === 'academicemail' ||
      cleanKey === 'البريد الأكاديمي' ||
      cleanKey === 'البريد'
    ) {
      normalized.academicEmail = String(val).trim();
    }
    // Status
    else if (
      cleanKey === 'status' ||
      cleanKey === 'حالة الحضور' ||
      cleanKey === 'الحالة'
    ) {
      normalized.status = String(val).trim().toLowerCase();
    }
  }

  return normalized;
}
