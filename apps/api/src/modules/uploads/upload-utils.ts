import type { CourseLevel, Semester } from '@student-portal/shared';

/**
 * Converts Arabic-Indic (٠-٩) and Eastern Arabic (۰-۹) digits to ASCII (0-9).
 */
export function toAsciiDigits(str: string): string {
  return str
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Safely unwraps ExcelJS cell objects (RichText, Formula, Hyperlink, Date, Error)
 * into primitive string/number/boolean values.
 */
export function unwrapExcelCellValue(val: unknown): string | number | boolean {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    return Number.isNaN(val.getTime()) ? '' : val.toISOString().split('T')[0];
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('error' in obj) return '';
    if ('result' in obj && obj.result !== undefined) {
      return unwrapExcelCellValue(obj.result);
    }
    if ('richText' in obj && Array.isArray(obj.richText)) {
      return obj.richText
        .map((part: unknown) => {
          if (typeof part === 'object' && part !== null && 'text' in part) {
            const textVal = (part as { text?: unknown }).text;
            return typeof textVal === 'string'
              ? textVal
              : typeof textVal === 'number'
                ? String(textVal)
                : '';
          }
          return '';
        })
        .join('')
        .trim();
    }
    if ('text' in obj && obj.text !== undefined) {
      return unwrapExcelCellValue(obj.text);
    }
    if ('hyperlink' in obj && typeof obj.hyperlink === 'string') {
      return obj.hyperlink.trim();
    }
    return '';
  }
  if (typeof val === 'string') {
    return val.replace(/^\uFEFF/, '').trim();
  }
  if (typeof val === 'number' || typeof val === 'boolean') {
    return val;
  }
  return '';
}

/**
 * Parses a value that may be a number, a string representation of a number,
 * or an Arabic placeholder. Returns `undefined` for non-numeric or empty values.
 */
export function parseSafeNumber(val: unknown): number | undefined {
  const unwrapped = unwrapExcelCellValue(val);
  if (unwrapped === '') {
    return undefined;
  }
  if (typeof unwrapped === 'number') {
    return Number.isFinite(unwrapped) ? unwrapped : undefined;
  }
  const rawStr =
    typeof unwrapped === 'string'
      ? unwrapped.trim()
      : typeof unwrapped === 'boolean'
        ? String(unwrapped)
        : '';
  const str = toAsciiDigits(rawStr).replace(/%/g, '').trim();
  if (
    !str ||
    str === 'محل' ||
    str === '-' ||
    str === '—' ||
    str.toLowerCase() === 'n/a' ||
    str.toLowerCase() === 'null' ||
    str.toLowerCase() === 'undefined'
  ) {
    return undefined;
  }
  const parsed = Number(str);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const LEVEL_ALIASES: Record<string, CourseLevel> = {
  '1': '1',
  first: '1',
  one: '1',
  level1: '1',
  year1: '1',
  الأول: '1',
  الاول: '1',
  أول: '1',
  اول: '1',
  الأولى: '1',
  الاولى: '1',
  أولى: '1',
  اولى: '1',
  الفرقةالأولى: '1',
  الفرقةالاولى: '1',
  المستوىالأول: '1',
  المستوىالاول: '1',
  '2': '2',
  second: '2',
  two: '2',
  level2: '2',
  year2: '2',
  الثاني: '2',
  ثاني: '2',
  الثانية: '2',
  ثانية: '2',
  الفرقةالثانية: '2',
  المستوىالثاني: '2',
  '3': '3',
  third: '3',
  three: '3',
  level3: '3',
  year3: '3',
  الثالث: '3',
  ثالث: '3',
  الثالثة: '3',
  ثالثة: '3',
  الفرقةالثالثة: '3',
  المستوىالثالث: '3',
  '4': '4',
  fourth: '4',
  four: '4',
  level4: '4',
  year4: '4',
  الرابع: '4',
  رابع: '4',
  الرابعة: '4',
  رابعة: '4',
  الفرقةالرابعة: '4',
  المستوىالرابع: '4',
};

export function normalizeStudentLevel(value: unknown): CourseLevel {
  const unwrapped = unwrapExcelCellValue(value);
  const raw = (
    typeof unwrapped === 'string'
      ? unwrapped
      : typeof unwrapped === 'number'
        ? String(unwrapped)
        : '1'
  ).trim();
  const compact = toAsciiDigits(raw)
    .toLowerCase()
    .replace(/[\s_-]/g, '');
  if (LEVEL_ALIASES[compact]) return LEVEL_ALIASES[compact];
  if (compact.includes('4') || compact.includes('رابع')) return '4';
  if (compact.includes('3') || compact.includes('ثالث')) return '3';
  if (compact.includes('2') || compact.includes('ثان')) return '2';
  return '1';
}

export function normalizeStudentSemester(value: unknown): Semester {
  const unwrapped = unwrapExcelCellValue(value);
  const raw = (
    typeof unwrapped === 'string'
      ? unwrapped
      : typeof unwrapped === 'number'
        ? String(unwrapped)
        : 'first'
  ).trim();
  const semester = toAsciiDigits(raw)
    .toLowerCase()
    .replace(/[\s_-]/g, '');
  if (
    semester === '2' ||
    semester === 'second' ||
    semester.includes('ثان') ||
    semester === 'term2' ||
    semester === 'sem2' ||
    semester === 'spring'
  ) {
    return 'second';
  }
  if (
    semester === '3' ||
    semester === 'summer' ||
    semester.includes('صيف') ||
    semester === 'term3' ||
    semester === 'sem3'
  ) {
    return 'summer';
  }
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
  options?: { strictNumbers?: boolean },
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  const parseNumeric = (value: unknown): number | undefined => {
    const raw = unwrapExcelCellValue(value);
    if (options?.strictNumbers && typeof raw === 'string' && raw.includes('%'))
      return Number.NaN;
    const parsed = parseSafeNumber(value);
    return options?.strictNumbers && parsed === undefined && raw !== ''
      ? Number.NaN
      : parsed;
  };

  for (const key of Object.keys(row)) {
    const cleanKey = key
      .replace(/^\uFEFF/, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/\*/g, '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]/g, '');
    const rawVal = row[key];
    const val = unwrapExcelCellValue(rawVal);

    if (val === '') {
      continue;
    }

    // Historical one-row component maxima and statuses, in either language.
    const historicalComponentFields: Record<string, string> = {
      courseworkmaxgrade: 'courseworkMaxGrade',
      عظمىأعمالالسنة: 'courseworkMaxGrade',
      courseworkstatus: 'courseworkStatus',
      حالةأعمالالسنة: 'courseworkStatus',
      midtermmaxgrade: 'midtermMaxGrade',
      عظمىالميدترم: 'midtermMaxGrade',
      midtermstatus: 'midtermStatus',
      حالةالميدترم: 'midtermStatus',
      finalmaxgrade: 'finalMaxGrade',
      عظمىالنهائي: 'finalMaxGrade',
      finalstatus: 'finalStatus',
      حالةالنهائي: 'finalStatus',
    };
    const componentField = historicalComponentFields[cleanKey];
    if (componentField && options?.strictNumbers) {
      normalized[componentField] = componentField.endsWith('MaxGrade')
        ? parseNumeric(val)
        : String(val).trim();
      continue;
    }

    // Student Code
    if (
      cleanKey === 'studentcode' ||
      cleanKey === 'usercode' ||
      cleanKey === 'كودالطالب' ||
      cleanKey === 'الكودالأكاديمي' ||
      cleanKey === 'الكودالاكاديمي' ||
      cleanKey === 'رقمجلوسالطالب' ||
      cleanKey === 'الكود'
    ) {
      normalized.studentCode = toAsciiDigits(String(val).trim());
    }
    // Arabic Name
    else if (
      cleanKey === 'fullnamear' ||
      cleanKey === 'namear' ||
      cleanKey === 'studentnamear' ||
      cleanKey === 'الاسمبالعربية' ||
      cleanKey === 'اسمالطالببالعربية' ||
      cleanKey === 'الاسمالرباعي' ||
      cleanKey === 'اسمالطالبرباعي' ||
      cleanKey === 'الاسمعربي' ||
      cleanKey === 'الاسمالعربي'
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
      cleanKey === 'الاسمبالانجليزية' ||
      cleanKey === 'الاسمبالإنجليزية' ||
      cleanKey === 'اسمالطالببالانجليزية' ||
      cleanKey === 'اسمالطالببالإنجليزية' ||
      cleanKey === 'الاسمانجليزي' ||
      cleanKey === 'الاسمإنجليزي'
    ) {
      normalized.fullNameEn = String(val).trim();
      if (!normalized.fullName) {
        normalized.fullName = String(val).trim();
      }
    }
    // Full Name
    else if (
      cleanKey === 'fullname' ||
      cleanKey === 'studentname' ||
      cleanKey === 'الاسم' ||
      cleanKey === 'الاسمبالكامل' ||
      cleanKey === 'اسمالطالب'
    ) {
      normalized.fullName = String(val).trim();
    }
    // National ID
    else if (
      cleanKey === 'nationalid' ||
      cleanKey === 'ssn' ||
      cleanKey === 'idnumber' ||
      cleanKey === 'الرقمالقومي' ||
      cleanKey === 'الرقمالقومى' ||
      cleanKey === 'رقمالبطاقة' ||
      cleanKey === 'رقماللهوية' ||
      cleanKey === 'رقمالهوية'
    ) {
      normalized.nationalId = toAsciiDigits(String(val).trim());
    }
    // Force password change
    else if (
      cleanKey === 'mustchangepassword' ||
      cleanKey === 'forcepasswordchange' ||
      cleanKey === 'تغييركلمةالمرورعندالدخول' ||
      cleanKey === 'تغييركلمةالمرور'
    ) {
      normalized.mustChangePassword = [
        'true',
        '1',
        'yes',
        'on',
        'نعم',
        'صح',
      ].includes(String(val).trim().toLowerCase());
    }
    // Level
    else if (
      cleanKey === 'level' ||
      cleanKey === 'academiclevel' ||
      cleanKey === 'المستوى' ||
      cleanKey === 'المستوي' ||
      cleanKey === 'الفرقة' ||
      cleanKey === 'الفرقةالدراسية' ||
      cleanKey === 'المستوىالدراسي'
    ) {
      normalized.level = toAsciiDigits(String(val).trim());
    }
    // Department
    else if (
      cleanKey === 'department' ||
      cleanKey === 'dept' ||
      cleanKey === 'major' ||
      cleanKey === 'specialization' ||
      cleanKey === 'القسم' ||
      cleanKey === 'القسمالعلمي' ||
      cleanKey === 'التخصص' ||
      cleanKey === 'الشعبةالعلمية'
    ) {
      normalized.department = String(val).trim();
    }
    // Group
    else if (
      cleanKey === 'group' ||
      cleanKey === 'studentgroup' ||
      cleanKey === 'المجموعة' ||
      cleanKey === 'مجموعة'
    ) {
      normalized.group = String(val).trim();
    }
    // Section
    else if (
      cleanKey === 'section' ||
      cleanKey === 'studentsection' ||
      cleanKey === 'السكشن' ||
      cleanKey === 'الشعبة' ||
      cleanKey === 'سكشن' ||
      cleanKey === 'شعبة'
    ) {
      normalized.section = String(val).trim();
    }
    // Academic Year
    else if (
      cleanKey === 'academicyear' ||
      cleanKey === 'year' ||
      cleanKey === 'السنةالدراسية' ||
      cleanKey === 'العامالدراسي' ||
      cleanKey === 'العامالأكاديمي' ||
      cleanKey === 'العامالاكاديمي'
    ) {
      normalized.academicYear = toAsciiDigits(String(val).trim());
    }
    // Semester
    else if (
      cleanKey === 'semester' ||
      cleanKey === 'term' ||
      cleanKey === 'الفصلالدراسي' ||
      cleanKey === 'الترم' ||
      cleanKey === 'الفصل'
    ) {
      normalized.semester = toAsciiDigits(String(val).trim().toLowerCase());
    }
    // Seat Number
    else if (
      cleanKey === 'seatnumber' ||
      cleanKey === 'seatno' ||
      cleanKey === 'seat' ||
      cleanKey === 'رقمالجلوس'
    ) {
      normalized.seatNumber = toAsciiDigits(String(val).trim());
    }
    // Exam Room
    else if (
      cleanKey === 'examroom' ||
      cleanKey === 'committee' ||
      cleanKey === 'room' ||
      cleanKey === 'رقماللجنة' ||
      cleanKey === 'اللجنة' ||
      cleanKey === 'مقراللجنة' ||
      cleanKey === 'القاعة'
    ) {
      normalized.examRoom = String(val).trim();
    }
    // Exam Floor
    else if (
      cleanKey === 'examfloor' ||
      cleanKey === 'floor' ||
      cleanKey === 'الدور' ||
      cleanKey === 'الطابق'
    ) {
      normalized.examFloor = String(val).trim();
    }
    // Exam Building
    else if (
      cleanKey === 'exambuilding' ||
      cleanKey === 'building' ||
      cleanKey === 'المبنى' ||
      cleanKey === 'المبني'
    ) {
      normalized.examBuilding = String(val).trim();
    }
    // Course Code
    else if (
      cleanKey === 'coursecode' ||
      cleanKey === 'subjectcode' ||
      cleanKey === 'كودالمادة' ||
      cleanKey === 'كودالمقرر' ||
      cleanKey === 'رمزالمادة' ||
      cleanKey === 'رمزالمقرر' ||
      cleanKey === 'code'
    ) {
      normalized.courseCode = toAsciiDigits(String(val).trim()).toUpperCase();
    }
    // Course Name
    else if (
      cleanKey === 'coursename' ||
      cleanKey === 'subjectname' ||
      cleanKey === 'اسمالمادة' ||
      cleanKey === 'المادة' ||
      cleanKey === 'اسمالمقرر' ||
      cleanKey === 'المقرر' ||
      cleanKey === 'name'
    ) {
      normalized.courseName = String(val).trim();
      if (!normalized.fullName) {
        normalized.fullName = String(val).trim();
      }
    } else if (
      cleanKey === 'coursenamear' ||
      cleanKey === 'arabicname' ||
      cleanKey === 'اسمالمادةبالعربية' ||
      cleanKey === 'اسمالمقرربالعربية' ||
      cleanKey === 'الاسمبالعربي'
    ) {
      normalized.courseNameAr = String(val).trim();
    } else if (
      cleanKey === 'coursenameen' ||
      cleanKey === 'اسمالمادةبالإنجليزية' ||
      cleanKey === 'اسمالمادةبالانجليزية' ||
      cleanKey === 'اسمالمقرربالإنجليزية' ||
      cleanKey === 'اسمالمقرربالانجليزية' ||
      cleanKey === 'الاسمبالانجليزي'
    ) {
      normalized.courseNameEn = String(val).trim();
    } else if (
      cleanKey === 'description' ||
      cleanKey === 'desc' ||
      cleanKey === 'الوصف' ||
      cleanKey === 'وصفالمقرر' ||
      cleanKey === 'نبذة'
    ) {
      normalized.description = String(val).trim();
    } else if (
      cleanKey === 'registrationpriority' ||
      cleanKey === 'priority' ||
      cleanKey === 'أولويةالتسجيل' ||
      cleanKey === 'اولويةالتسجيل' ||
      cleanKey === 'الأولوية' ||
      cleanKey === 'الاولوية'
    ) {
      normalized.registrationPriority = parseNumeric(val);
    } else if (
      cleanKey === 'prerequisites' ||
      cleanKey === 'prerequisitecodes' ||
      cleanKey === 'prereq' ||
      cleanKey === 'المتطلباتالسابقة' ||
      cleanKey === 'المتطلبالسابق' ||
      cleanKey === 'متطلبسابق'
    ) {
      normalized.prerequisites = String(val)
        .split(/[,;،|]/)
        .map((code) => toAsciiDigits(code.trim()).toUpperCase())
        .filter(
          (c) =>
            Boolean(c) &&
            c !== 'NONE' &&
            c !== 'N/A' &&
            c !== '-' &&
            c !== 'لا يوجد' &&
            c !== 'لايوجد' &&
            c !== 'بدون',
        );
    } else if (
      cleanKey === 'corequisites' ||
      cleanKey === 'corequisitecodes' ||
      cleanKey === 'المتطلباتالمتزامنة' ||
      cleanKey === 'المتطلبالمتزامن'
    ) {
      normalized.coRequisites = String(val)
        .split(/[,;،|]/)
        .map((code) => toAsciiDigits(code.trim()).toUpperCase())
        .filter(Boolean);
    } else if (
      cleanKey === 'equivalentcourses' ||
      cleanKey === 'equivalentcoursecodes' ||
      cleanKey === 'المقرراتالمعادلة' ||
      cleanKey === 'المقررالمعادل'
    ) {
      normalized.equivalentCourses = String(val)
        .split(/[,;،|]/)
        .map((code) => toAsciiDigits(code.trim()).toUpperCase())
        .filter(Boolean);
    } else if (
      cleanKey === 'offeredterms' ||
      cleanKey === 'availableterms' ||
      cleanKey === 'فصولالطرح'
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
        .split(/[,;،|]/)
        .map((term) => {
          const clean = toAsciiDigits(term.trim().toLowerCase());
          return termMap[clean] || clean;
        })
        .filter(Boolean);
    } else if (
      cleanKey === 'type' ||
      cleanKey === 'coursetype' ||
      cleanKey === 'نوعالمقرر' ||
      cleanKey === 'نوعالمادة'
    ) {
      const rawType = String(val).trim().toLowerCase();
      if (rawType === 'إجباري' || rawType === 'اجباري') {
        normalized.courseType = 'required';
      } else if (rawType === 'اختياري') {
        normalized.courseType = 'elective';
      } else {
        normalized.courseType = rawType;
      }
    } else if (
      cleanKey === 'programcurricula' ||
      cleanKey === 'departmentcurricula' ||
      cleanKey === 'curricula' ||
      cleanKey === 'توزيعلوائحالأقسام' ||
      cleanKey === 'لوائحالأقسام' ||
      cleanKey === 'اللائحة'
    ) {
      normalized.programCurricula = String(val).trim();
    } else if (
      cleanKey === 'academicwarnings' ||
      cleanKey === 'academicwarningcount' ||
      cleanKey === 'warningcount' ||
      cleanKey === 'warnings' ||
      cleanKey === 'عددالإنذاراتالأكاديمية' ||
      cleanKey === 'عددالانذاراتالاكاديمية' ||
      cleanKey === 'الإنذاراتالأكاديمية' ||
      cleanKey === 'الانذاراتالاكاديمية' ||
      cleanKey === 'الإنذارات' ||
      cleanKey === 'الانذارات' ||
      cleanKey === 'إنذارات'
    ) {
      normalized.academicWarnings = parseNumeric(val);
    } else if (
      cleanKey === 'recommendedsemester' ||
      cleanKey === 'الفصلالموصىبه'
    ) {
      normalized.recommendedSemester = parseNumeric(val);
    } else if (cleanKey === 'minimumgpa' || cleanKey === 'الحدالأدنىللمعدل') {
      normalized.minimumGpa = parseNumeric(val);
    }
    // Credit Hours
    else if (
      cleanKey === 'credithours' ||
      cleanKey === 'hours' ||
      cleanKey === 'credits' ||
      cleanKey === 'الساعات' ||
      cleanKey === 'الساعاتالمعتمدة' ||
      cleanKey === 'عددالساعات'
    ) {
      normalized.creditHours = parseNumeric(val);
    }
    // Max Grade (Checked first to avoid prefix collisions)
    else if (
      cleanKey === 'maxgrade' ||
      cleanKey === 'maxscore' ||
      cleanKey === 'fullmark' ||
      cleanKey === 'الدرجةالعظمى' ||
      cleanKey === 'الدرجةالقصوى' ||
      cleanKey === 'العظمى' ||
      cleanKey === 'أقصىدرجة' ||
      cleanKey === 'النهايةالعظمى'
    ) {
      normalized.maxGrade = parseNumeric(val);
    }
    // Grade Value
    else if (
      cleanKey === 'grade' ||
      cleanKey === 'score' ||
      cleanKey === 'mark' ||
      cleanKey === 'quizscore' ||
      cleanKey === 'الدرجة' ||
      cleanKey === 'درجة' ||
      cleanKey === 'الدرجةالمحققة' ||
      cleanKey === 'درجةالكويز' ||
      cleanKey === 'درجةالطالب'
    ) {
      normalized.grade = parseNumeric(val);
    }
    // Midterm breakdown
    else if (
      cleanKey === 'midterm' ||
      cleanKey === 'midtermscore' ||
      cleanKey === 'midtermgrade' ||
      cleanKey === 'ميدترم' ||
      cleanKey === 'الميدترم' ||
      cleanKey === 'امتحانالميدترم' ||
      cleanKey === 'درجةالميدترم' ||
      cleanKey === 'أعمالالفصل' ||
      cleanKey === 'نصفي'
    ) {
      normalized.midterm = parseNumeric(val);
    }
    // Final breakdown
    else if (
      cleanKey === 'final' ||
      cleanKey === 'finalscore' ||
      cleanKey === 'finalgrade' ||
      cleanKey === 'نهائي' ||
      cleanKey === 'النهائي' ||
      cleanKey === 'الامتحانالنهائي' ||
      cleanKey === 'درجةالنهائي' ||
      cleanKey === 'فاينل' ||
      cleanKey === 'تحريري'
    ) {
      normalized.final = parseNumeric(val);
    }
    // Coursework breakdown
    else if (
      cleanKey === 'coursework' ||
      cleanKey === 'courseworkscore' ||
      cleanKey === 'yearwork' ||
      cleanKey === 'أعمالالسنة' ||
      cleanKey === 'اعمالالسنة' ||
      cleanKey === 'درجةأعمالالسنة' ||
      cleanKey === 'أعمالسنة' ||
      cleanKey === 'سنة'
    ) {
      normalized.coursework = parseNumeric(val);
    }
    // Practical breakdown
    else if (
      cleanKey === 'practical' ||
      cleanKey === 'practicalscore' ||
      cleanKey === 'practicalgrade' ||
      cleanKey === 'oral' ||
      cleanKey === 'عملي' ||
      cleanKey === 'شفوي' ||
      cleanKey === 'عمليشفوي' ||
      cleanKey === 'الامتحانالعملي' ||
      cleanKey === 'درجةالعملي'
    ) {
      normalized.practical = parseNumeric(val);
    }
    // Total Score
    else if (
      cleanKey === 'total' ||
      cleanKey === 'totalscore' ||
      cleanKey === 'totalgrade' ||
      cleanKey === 'المجموع' ||
      cleanKey === 'المجموعالكلي' ||
      cleanKey === 'الدرجةالكلية' ||
      cleanKey === 'إجماليالدرجة'
    ) {
      normalized.total = parseNumeric(val);
    } else if (cleanKey === 'maxmidterm' || cleanKey === 'عظمىالميدترم') {
      normalized.maxMidterm = parseNumeric(val);
    } else if (cleanKey === 'maxfinal' || cleanKey === 'عظمىالنهائي') {
      normalized.maxFinal = parseNumeric(val);
    } else if (cleanKey === 'maxcoursework' || cleanKey === 'عظمىأعمالالسنة') {
      normalized.maxCoursework = parseNumeric(val);
    } else if (cleanKey === 'maxpractical' || cleanKey === 'عظمىالعملي') {
      normalized.maxPractical = parseNumeric(val);
    }
    // Exam Type
    else if (
      cleanKey === 'examtype' ||
      cleanKey === 'نوعالامتحان' ||
      cleanKey === 'نوعالاختبار' ||
      cleanKey === 'التقييم'
    ) {
      const rawExam = String(val).trim().toLowerCase();
      if (rawExam.includes('ميدترم') || rawExam.includes('نصفي')) {
        normalized.examType = 'midterm';
      } else if (rawExam.includes('عملي') || rawExam.includes('شفوي')) {
        normalized.examType = 'practical';
      } else if (rawExam.includes('أعمال') || rawExam.includes('اعمال')) {
        normalized.examType = 'coursework';
      } else if (rawExam.includes('نهائ') || rawExam.includes('فاينل')) {
        normalized.examType = 'final';
      } else {
        normalized.examType = rawExam;
      }
    }
    // Quiz Number
    else if (
      cleanKey === 'quiznumber' ||
      cleanKey === 'quizno' ||
      cleanKey === 'quizindex' ||
      cleanKey === 'رقمالكويز' ||
      cleanKey === 'رقمالاختبار' ||
      cleanKey === 'كويزرقم'
    ) {
      normalized.quizNumber = parseNumeric(val);
    }
    // Quiz Title
    else if (
      cleanKey === 'title' ||
      cleanKey === 'quiztitle' ||
      cleanKey === 'quizname' ||
      cleanKey === 'عنوانالكويز' ||
      cleanKey === 'اسمالكويز' ||
      cleanKey === 'عنوانالاختبار'
    ) {
      normalized.title = String(val).trim();
    }
    // Attendance Stats
    else if (
      cleanKey === 'totallectures' ||
      cleanKey === 'totalsessions' ||
      cleanKey === 'المحاضراتالكلية' ||
      cleanKey === 'إجماليالمحاضرات' ||
      cleanKey === 'اجماليالمحاضرات' ||
      cleanKey === 'عددالمحاضرات'
    ) {
      normalized.totalLectures = parseNumeric(val);
    } else if (
      cleanKey === 'attendedlectures' ||
      cleanKey === 'attendedsessions' ||
      cleanKey === 'attended' ||
      cleanKey === 'المحاضراتالحاضرة' ||
      cleanKey === 'مراتالحضور' ||
      cleanKey === 'عددالحضور' ||
      cleanKey === 'حضور'
    ) {
      normalized.attendedLectures = parseNumeric(val);
    } else if (
      cleanKey === 'absencelectures' ||
      cleanKey === 'absentlectures' ||
      cleanKey === 'absences' ||
      cleanKey === 'absent' ||
      cleanKey === 'المحاضراتالغائبة' ||
      cleanKey === 'مراتالغياب' ||
      cleanKey === 'عددالغياب' ||
      cleanKey === 'غياب'
    ) {
      normalized.absenceLectures = parseNumeric(val);
    }
    // Academic Email
    else if (
      cleanKey === 'academicemail' ||
      cleanKey === 'universityemail' ||
      cleanKey === 'email' ||
      cleanKey === 'البريدالأكاديمي' ||
      cleanKey === 'البريدالاكاديمي' ||
      cleanKey === 'البريدالجامعي' ||
      cleanKey === 'الإيميلالأكاديمي' ||
      cleanKey === 'الايميلالاكاديمي' ||
      cleanKey === 'البريد'
    ) {
      normalized.academicEmail = String(val).trim().toLowerCase();
    }
    // Status
    else if (
      cleanKey === 'status' ||
      cleanKey === 'emailstatus' ||
      cleanKey === 'attendancestatus' ||
      cleanKey === 'حالةالحضور' ||
      cleanKey === 'حالةالبريد' ||
      cleanKey === 'الحالة'
    ) {
      const rawStatus = String(val).trim().toLowerCase();
      if (
        rawStatus === 'حاضر' ||
        rawStatus === 'حضور' ||
        rawStatus === 'present'
      ) {
        normalized.status = 'present';
      } else if (
        rawStatus === 'غائب' ||
        rawStatus === 'غياب' ||
        rawStatus === 'absent'
      ) {
        normalized.status = 'absent';
      } else if (
        rawStatus === 'محروم' ||
        rawStatus === 'حرمان' ||
        rawStatus === 'banned'
      ) {
        normalized.status = 'banned';
      } else if (
        rawStatus === 'نشط' ||
        rawStatus === 'مفعل' ||
        rawStatus === 'فعال' ||
        rawStatus === 'active'
      ) {
        normalized.status = 'active';
      } else if (
        rawStatus === 'معلق' ||
        rawStatus === 'موقوف' ||
        rawStatus === 'غير نشط' ||
        rawStatus === 'غير مفعل' ||
        rawStatus === 'suspended' ||
        rawStatus === 'inactive'
      ) {
        normalized.status = 'suspended';
      } else {
        normalized.status = rawStatus;
      }
    } else {
      // Preserve any unmapped field as-is so pre-mapped batch rows are never lost
      normalized[key] = val;
    }
  }

  return normalized;
}
