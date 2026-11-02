import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { AnalyticsQueryDto } from '../dto/analytics-query.dto';
import type { AuthenticatedUser } from '../../auth/types/authenticated-request';
import { AnalyticsQueryService } from './analytics-query.service';
import { getReportLabels } from '../i18n/report-labels';
import { formatStaffDisplayName } from '@student-portal/shared';

@Injectable()
export class AnalyticsExcelService {
  private readonly logger = new Logger(AnalyticsExcelService.name);

  constructor(private readonly queryService: AnalyticsQueryService) {}

  async generateComprehensiveWorkbook(
    query: AnalyticsQueryDto,
    user: AuthenticatedUser,
  ): Promise<ExcelJS.Workbook> {
    const locale = query.locale || 'ar';
    const isAr = locale === 'ar';
    const labels = getReportLabels(locale);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = user.name || 'Higher Institute Student Portal';
    workbook.lastModifiedBy = user.name || 'Higher Institute Student Portal';
    workbook.created = new Date();
    workbook.modified = new Date();

    // Fetch all datasets in parallel
    const [overview, quizzes, staffPerf, courses, students, detailedSubs] =
      await Promise.all([
        this.queryService.getOverview(query, user),
        this.queryService.getQuizzesAnalytics(query, user),
        this.queryService.getStaffQuizPerformance(query, user),
        this.queryService.getCoursesAnalytics(query, user),
        this.queryService.getStudentsAnalytics(query),
        query.includeSubmissions
          ? this.queryService.getDetailedSubmissions(query, user)
          : Promise.resolve([]),
      ]);

    const headerFill: ExcelJS.FillPattern = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0D9488' }, // Teal 600
    };

    const headerFont: Partial<ExcelJS.Font> = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };

    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };

    const applySheetDefaults = (sheet: ExcelJS.Worksheet) => {
      sheet.views = [{ rightToLeft: isAr, state: 'frozen', ySplit: 1 }];
      const hRow = sheet.getRow(1);
      hRow.height = 28;
      hRow.eachCell((cell) => {
        cell.fill = headerFill;
        cell.font = headerFont;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = thinBorder;
      });
    };

    const autoFitColumns = (sheet: ExcelJS.Worksheet, minWidth = 14) => {
      sheet.columns.forEach((col) => {
        let maxLen = minWidth;
        col.eachCell?.({ includeEmpty: true }, (cell) => {
          const text = cell.text;
          if (text.length > maxLen) {
            maxLen = Math.min(text.length + 3, 50);
          }
        });
        col.width = maxLen;
      });
    };

    // ─── Sheet 0: معلومات التقرير / Report Info ────────────────────────
    const infoSheet = workbook.addWorksheet(labels.sheets.info, {
      views: [{ rightToLeft: isAr }],
    });
    infoSheet.columns = [{ width: 32 }, { width: 55 }];

    // Banner
    infoSheet.mergeCells('A1:B1');
    const bCell = infoSheet.getCell('A1');
    bCell.value = labels.info.title;
    bCell.fill = headerFill;
    bCell.font = {
      name: 'Calibri',
      size: 14,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    bCell.alignment = { vertical: 'middle', horizontal: 'center' };
    infoSheet.getRow(1).height = 36;

    const cairoDate = new Intl.DateTimeFormat(isAr ? 'ar-EG' : 'en-GB', {
      timeZone: 'Africa/Cairo',
      dateStyle: 'full',
      timeStyle: 'medium',
    }).format(new Date());

    const infoRows: [string, string][] = [
      [labels.info.generatedAt, cairoDate],
      [labels.info.generatedBy, user.name || 'Admin'],
      [
        labels.info.role,
        labels.staffRoles[user.staffType || ''] ||
          labels.staffRoles[user.role] ||
          user.role,
      ],
      [labels.info.academicYear, query.academicYear || labels.info.all],
      [
        labels.info.semester,
        query.semester
          ? labels.statuses[query.semester] || query.semester
          : labels.info.all,
      ],
      [labels.info.department, query.department || labels.info.all],
      [
        labels.info.level,
        query.level
          ? `${isAr ? 'الفرقة' : 'Level'} ${query.level}`
          : labels.info.all,
      ],
      ['', ''],
      [labels.info.methodologyTitle, ''],
      [labels.sheets.kpis, labels.info.kpiDef],
      [labels.sheets.quizzes, labels.info.quizDef],
      [labels.sheets.courses, labels.info.courseDef],
    ];

    infoRows.forEach(([lbl, val], idx) => {
      const rNum = idx + 2;
      const row = infoSheet.getRow(rNum);
      row.getCell(1).value = lbl;
      row.getCell(1).font = { bold: true, color: { argb: 'FF1E293B' } };
      row.getCell(2).value = val;
      row.getCell(2).font = { color: { argb: 'FF334155' } };
      if (lbl === labels.info.methodologyTitle) {
        row.getCell(1).font = {
          bold: true,
          size: 12,
          color: { argb: 'FF0D9488' },
        };
      }
      row.height = 22;
    });

    // ─── Sheet 1: المؤشرات العامة / Summary KPIs ─────────────────────
    const kpiSheet = workbook.addWorksheet(labels.sheets.kpis);
    kpiSheet.columns = [
      { header: labels.common.seq, key: 'seq', width: 6 },
      { header: labels.common.metric, key: 'metric', width: 38 },
      { header: labels.common.value, key: 'value', width: 20 },
      { header: labels.common.notes, key: 'notes', width: 35 },
    ];

    const kpiData = [
      {
        m: isAr ? 'إجمالي الطلاب المسجلين' : 'Total Students',
        v: overview.kpis.totalStudents,
        n: isAr ? 'جميع الطلاب بالمنظومة' : 'All students',
      },
      {
        m: isAr ? 'الطلاب المنتظمون' : 'Active Students',
        v: overview.kpis.activeStudents,
        n: isAr ? 'قيد نشط ومقيد بالدراسة' : 'Active enrolled',
      },
      {
        m: isAr ? 'نسبة انتظام القيد' : 'Active Enrollment Rate',
        v: overview.kpis.activeRate / 100,
        n: `${overview.kpis.activeRate}%`,
        isPct: true,
      },
      {
        m: isAr ? 'الطلاب موقوفو القيد' : 'Suspended Students',
        v: overview.kpis.suspendedStudents,
        n: '',
      },
      {
        m: isAr ? 'الطلاب المنسحبون والمحولون' : 'Withdrawn Students',
        v: overview.kpis.withdrawnStudents,
        n: '',
      },
      {
        m: isAr ? 'الطلاب الخريجون' : 'Graduated Students',
        v: overview.kpis.graduatedStudents,
        n: '',
      },
      {
        m: isAr ? 'إجمالي المقررات الأكاديمية' : 'Total Courses',
        v: overview.kpis.totalCourses,
        n: '',
      },
      {
        m: isAr ? 'المقررات النشطة والمطروحة' : 'Active Courses',
        v: overview.kpis.activeCourses,
        n: '',
      },
      {
        m: isAr
          ? 'إجمالي أعضاء هيئة التدريس والهيئة المعاونة'
          : 'Total Faculty & Staff',
        v: overview.kpis.totalStaff,
        n: '',
      },
      {
        m: isAr ? 'أساتذة المقررات (دكاترة)' : 'Professors & Lecturers',
        v: overview.kpis.doctorCount,
        n: '',
      },
      {
        m: isAr ? 'مدرسون مساعدون' : 'Assistant Lecturers',
        v: overview.kpis.assistantLecturerCount,
        n: '',
      },
      {
        m: isAr ? 'معيدون (هيئة معاونة)' : 'Teaching Assistants',
        v: overview.kpis.teachingAssistantCount,
        n: '',
      },
      {
        m: isAr ? 'إجمالي الاختبارات الإلكترونية (الكويزات)' : 'Total Quizzes',
        v: overview.kpis.totalQuizzes,
        n: '',
      },
      {
        m: isAr ? 'الكويزات المنشورة والمفعلة' : 'Published Quizzes',
        v: overview.kpis.publishedQuizzes,
        n: '',
      },
      {
        m: isAr
          ? 'متوسط نسبة المشاركة في الكويزات'
          : 'Avg Quiz Participation Rate',
        v: overview.kpis.avgQuizParticipationRate / 100,
        n: `${overview.kpis.avgQuizParticipationRate}%`,
        isPct: true,
      },
      {
        m: isAr ? 'متوسط نسبة النجاح في الكويزات' : 'Avg Quiz Pass Rate',
        v: overview.kpis.avgQuizPassRate / 100,
        n: `${overview.kpis.avgQuizPassRate}%`,
        isPct: true,
      },
      {
        m: isAr ? 'إجمالي تذاكر الشكاوى' : 'Total Complaints',
        v: overview.kpis.totalComplaints,
        n: '',
      },
      {
        m: isAr ? 'الشكاوى التي تم حلها' : 'Resolved Complaints',
        v: overview.kpis.resolvedComplaints,
        n: '',
      },
      {
        m: isAr ? 'نسبة إنجاز الشكاوى' : 'Complaint Resolution Rate',
        v: overview.kpis.complaintResolutionRate / 100,
        n: `${overview.kpis.complaintResolutionRate}%`,
        isPct: true,
      },
      {
        m: isAr ? 'الشكاوى العاجلة' : 'Urgent Complaints',
        v: overview.kpis.urgentComplaints,
        n: '',
      },
    ];

    kpiData.forEach((item, idx) => {
      const row = kpiSheet.addRow({
        seq: idx + 1,
        metric: item.m,
        value: item.v,
        notes: item.n,
      });
      if (item.isPct) {
        row.getCell(3).numFmt = '0.0%';
      }
      row.height = 20;
    });
    applySheetDefaults(kpiSheet);

    // ─── Sheet 2: الأقسام والشعب / Departments ─────────────────────────
    const deptSheet = workbook.addWorksheet(labels.sheets.departments);
    deptSheet.columns = [
      { header: labels.common.seq, key: 'seq', width: 6 },
      {
        header: isAr ? 'القسم / المسار الأكاديمي' : 'Department',
        key: 'name',
        width: 32,
      },
      { header: isAr ? 'الرمز' : 'Code', key: 'code', width: 12 },
      {
        header: isAr ? 'عدد الطلاب المسجلين' : 'Enrolled Students',
        key: 'enrolled',
        width: 22,
      },
      {
        header: isAr ? 'الطلاب المنتظمون' : 'Active',
        key: 'active',
        width: 16,
      },
      {
        header: isAr ? 'موقوف/منسحب' : 'Withdrawn/Suspended',
        key: 'inactive',
        width: 18,
      },
      {
        header: isAr ? 'النسبة من إجمالي الطلاب' : 'Share of Total',
        key: 'pct',
        width: 22,
      },
    ];

    const deptCounts: Record<
      string,
      { total: number; active: number; inactive: number }
    > = {};
    students.forEach((s) => {
      const d = s.department || 'GEN';
      if (!deptCounts[d]) deptCounts[d] = { total: 0, active: 0, inactive: 0 };
      deptCounts[d].total += 1;
      if (s.enrollmentStatus === 'active') deptCounts[d].active += 1;
      else deptCounts[d].inactive += 1;
    });

    const deptMeta: Record<string, { ar: string; en: string }> = {
      GEN: { ar: 'الشعبة العامة', en: 'General Division' },
      BIS: {
        ar: 'نظم معلومات الأعمال (BIS)',
        en: 'Business Information Systems (BIS)',
      },
      ACC: { ar: 'المحاسبة والمراجعة', en: 'Accounting & Auditing' },
    };

    let deptSeq = 1;
    for (const [code, counts] of Object.entries(deptCounts)) {
      const meta = deptMeta[code] || { ar: code, en: code };
      const row = deptSheet.addRow({
        seq: deptSeq++,
        name: isAr ? meta.ar : meta.en,
        code,
        enrolled: counts.total,
        active: counts.active,
        inactive: counts.inactive,
        pct:
          overview.kpis.totalStudents > 0
            ? counts.total / overview.kpis.totalStudents
            : 0,
      });
      row.getCell(7).numFmt = '0.0%';
      row.height = 20;
    }
    applySheetDefaults(deptSheet);

    // ─── Sheet 3: استبقاء الدفعات / Cohort Retention ─────────────────
    const cohortSheet = workbook.addWorksheet(labels.sheets.cohorts);
    cohortSheet.columns = [
      { header: isAr ? 'الفرقة الدراسية' : 'Level', key: 'level', width: 26 },
      {
        header: isAr ? 'إجمالي المقيدين' : 'Total Enrolled',
        key: 'total',
        width: 18,
      },
      {
        header: isAr ? 'الطلاب المنتظمون' : 'Active Students',
        key: 'active',
        width: 18,
      },
      {
        header: isAr ? 'إنذار أكاديمي وتعثر' : 'Academic Probation',
        key: 'probation',
        width: 20,
      },
      {
        header: isAr ? 'انسحاب ووقف قيد' : 'Attrition / Withdrawn',
        key: 'attrition',
        width: 20,
      },
      {
        header: isAr ? 'نسبة الاستبقاء الأكاديمي' : 'Retention Rate',
        key: 'retentionRate',
        width: 24,
      },
    ];

    const levelCounts: Record<
      string,
      { total: number; active: number; probation: number; attrition: number }
    > = {
      '1': { total: 0, active: 0, probation: 0, attrition: 0 },
      '2': { total: 0, active: 0, probation: 0, attrition: 0 },
      '3': { total: 0, active: 0, probation: 0, attrition: 0 },
      '4': { total: 0, active: 0, probation: 0, attrition: 0 },
    };

    students.forEach((s) => {
      const lvl = String(s.level || '1');
      if (levelCounts[lvl]) {
        levelCounts[lvl].total += 1;
        if (s.enrollmentStatus === 'active') levelCounts[lvl].active += 1;
        if (
          s.enrollmentStatus === 'withdrawn' ||
          s.enrollmentStatus === 'suspended'
        ) {
          levelCounts[lvl].attrition += 1;
        }
        if (s.gpa != null && s.gpa < 2.0) {
          levelCounts[lvl].probation += 1;
        }
      }
    });

    const levelNames: Record<string, { ar: string; en: string }> = {
      '1': { ar: 'الفرقة الأولى (عام)', en: 'Level 1 (General)' },
      '2': { ar: 'الفرقة الثانية (عام)', en: 'Level 2 (General)' },
      '3': { ar: 'الفرقة الثالثة (تخصص)', en: 'Level 3 (Specialization)' },
      '4': { ar: 'الفرقة الرابعة (تخرج)', en: 'Level 4 (Graduation)' },
    };

    ['1', '2', '3', '4'].forEach((lvl) => {
      const counts = levelCounts[lvl];
      const rate = counts.total > 0 ? counts.active / counts.total : 1;
      const row = cohortSheet.addRow({
        level: isAr ? levelNames[lvl].ar : levelNames[lvl].en,
        total: counts.total,
        active: counts.active,
        probation: counts.probation,
        attrition: counts.attrition,
        retentionRate: rate,
      });
      row.getCell(6).numFmt = '0.0%';
      row.height = 20;
    });
    applySheetDefaults(cohortSheet);

    // ─── Sheet 4: توزيع المعدلات / GPA Distribution ───────────────────
    const gpaSheet = workbook.addWorksheet(labels.sheets.gpa);
    gpaSheet.columns = [
      {
        header: isAr ? 'الفئة الأكاديمية' : 'Standing Band',
        key: 'band',
        width: 28,
      },
      {
        header: isAr ? 'نطاق المعدل (GPA)' : 'GPA Range',
        key: 'range',
        width: 18,
      },
      {
        header: isAr ? 'عدد الطلاب' : 'Student Count',
        key: 'count',
        width: 16,
      },
      { header: labels.common.percentage, key: 'pct', width: 16 },
    ];

    const gpaBands = [
      {
        ar: 'إنذار أكاديمي (< 2.0)',
        en: 'Academic Probation (< 2.0)',
        range: '< 2.0',
        min: 0,
        max: 2.0,
      },
      {
        ar: 'مقبول (2.0 - 2.49)',
        en: 'Pass (2.0 - 2.49)',
        range: '2.0 - 2.49',
        min: 2.0,
        max: 2.5,
      },
      {
        ar: 'جيد (2.5 - 2.99)',
        en: 'Good (2.5 - 2.99)',
        range: '2.5 - 2.99',
        min: 2.5,
        max: 3.0,
      },
      {
        ar: 'جيد جداً (3.0 - 3.49)',
        en: 'Very Good (3.0 - 3.49)',
        range: '3.0 - 3.49',
        min: 3.0,
        max: 3.5,
      },
      {
        ar: 'ممتاز (3.5 - 4.0)',
        en: 'Excellent (3.5 - 4.0)',
        range: '3.5 - 4.0',
        min: 3.5,
        max: 4.01,
      },
      {
        ar: 'بدون رصد معدل حالي',
        en: 'No GPA Recorded',
        range: 'N/A',
        min: -1,
        max: -1,
      },
    ];

    const bandCounts = gpaBands.map(() => 0);
    students.forEach((s) => {
      if (s.gpa == null) {
        bandCounts[5] += 1;
      } else {
        const idx = gpaBands.findIndex(
          (b, i) => i < 5 && s.gpa >= b.min && s.gpa < b.max,
        );
        if (idx !== -1) bandCounts[idx] += 1;
        else bandCounts[5] += 1;
      }
    });

    const totalStudentsCount = students.length;
    gpaBands.forEach((b, idx) => {
      const c = bandCounts[idx];
      const row = gpaSheet.addRow({
        band: isAr ? b.ar : b.en,
        range: b.range,
        count: c,
        pct: totalStudentsCount > 0 ? c / totalStudentsCount : 0,
      });
      row.getCell(4).numFmt = '0.0%';
      row.height = 20;
    });
    applySheetDefaults(gpaSheet);

    // ─── Sheet 5: حالات القيد / Enrollment Status ──────────────────────
    const enrollSheet = workbook.addWorksheet(labels.sheets.enrollment);
    enrollSheet.columns = [
      {
        header: isAr ? 'حالة القيد الأكاديمي' : 'Enrollment Status',
        key: 'status',
        width: 28,
      },
      { header: isAr ? 'عدد الطلاب' : 'Count', key: 'count', width: 16 },
      { header: labels.common.percentage, key: 'pct', width: 16 },
    ];

    const statusCounts: Record<string, number> = {
      active: overview.kpis.activeStudents,
      suspended: overview.kpis.suspendedStudents,
      withdrawn: overview.kpis.withdrawnStudents,
      graduated: overview.kpis.graduatedStudents,
    };

    for (const [st, count] of Object.entries(statusCounts)) {
      const row = enrollSheet.addRow({
        status: labels.statuses[st] || st,
        count,
        pct: totalStudentsCount > 0 ? count / totalStudentsCount : 0,
      });
      row.getCell(3).numFmt = '0.0%';
      row.height = 20;
    }
    applySheetDefaults(enrollSheet);

    // ─── Sheet 6: تحليل الكويزات / Quiz Analysis (NEW & DETAILED) ─────
    const quizSheet = workbook.addWorksheet(labels.sheets.quizzes);
    quizSheet.columns = [
      { header: labels.common.seq, key: 'seq', width: 6 },
      {
        header: isAr ? 'عنوان الاختبار (الكويز)' : 'Quiz Title',
        key: 'title',
        width: 28,
      },
      {
        header: isAr ? 'كود المادة' : 'Course Code',
        key: 'courseCode',
        width: 14,
      },
      {
        header: isAr ? 'اسم المقرر الدراسي' : 'Course Name',
        key: 'courseName',
        width: 28,
      },
      {
        header: isAr ? 'منشئ الكويز' : 'Creator',
        key: 'creatorName',
        width: 24,
      },
      {
        header: isAr ? 'صفة المنشئ' : 'Creator Title / Role',
        key: 'creatorRole',
        width: 22,
      },
      {
        header: isAr ? 'العام / الفصل' : 'Year & Term',
        key: 'term',
        width: 18,
      },
      { header: labels.common.status, key: 'isPublished', width: 16 },
      {
        header: isAr ? 'المدة (د)' : 'Duration (m)',
        key: 'duration',
        width: 12,
      },
      {
        header: isAr ? 'الدرجة الكلية' : 'Total Marks',
        key: 'totalMarks',
        width: 12,
      },
      {
        header: isAr ? 'درجة النجاح' : 'Passing Marks',
        key: 'passingMarks',
        width: 12,
      },
      {
        header: isAr ? 'الطلاب المستحقون' : 'Eligible Students',
        key: 'eligible',
        width: 16,
      },
      {
        header: isAr ? 'بدأوا الاختبار' : 'Started',
        key: 'started',
        width: 14,
      },
      {
        header: isAr ? 'سلّموا الاختبار' : 'Submitted',
        key: 'submitted',
        width: 14,
      },
      {
        header: isAr ? 'لم يدخلوا' : 'Did Not Start',
        key: 'notStarted',
        width: 14,
      },
      {
        header: isAr ? 'نسبة الدخول والمشاركة' : 'Participation Rate',
        key: 'partRate',
        width: 20,
      },
      { header: isAr ? 'عدد الناجحين' : 'Passed', key: 'passed', width: 14 },
      { header: isAr ? 'عدد الراسبين' : 'Failed', key: 'failed', width: 14 },
      {
        header: isAr ? 'نسبة النجاح' : 'Pass Rate',
        key: 'passRate',
        width: 18,
      },
      {
        header: isAr ? 'متوسط الدرجة' : 'Avg Score',
        key: 'avgScore',
        width: 14,
      },
      { header: isAr ? 'أعلى درجة' : 'Max Score', key: 'highScore', width: 12 },
      { header: isAr ? 'أقل درجة' : 'Min Score', key: 'lowScore', width: 12 },
      { header: isAr ? 'إنهاء بالخروج' : 'Exited', key: 'exited', width: 14 },
      {
        header: isAr ? 'انتهاء الوقت' : 'Timed Out',
        key: 'timedOut',
        width: 14,
      },
    ];

    quizzes.forEach((q, i) => {
      const creatorDisplay = formatStaffDisplayName(
        {
          name: q.creatorName,
          nameAr: q.creatorNameAr,
          staffType: q.creatorStaffType,
        },
        locale,
      );
      const roleLabel =
        labels.staffRoles[q.creatorStaffType || ''] || q.creatorStaffType || '';
      const courseTitle =
        isAr && q.courseNameAr ? q.courseNameAr : q.courseName;

      const row = quizSheet.addRow({
        seq: i + 1,
        title: isAr && q.quizTitleAr ? q.quizTitleAr : q.quizTitle,
        courseCode: q.courseCode,
        courseName: courseTitle,
        creatorName: creatorDisplay,
        creatorRole: roleLabel,
        term: `${q.academicYear || ''} (${q.semester ? labels.statuses[q.semester] || q.semester : ''})`.trim(),
        isPublished: q.isPublished
          ? labels.statuses.published
          : labels.statuses.draft,
        duration: q.durationMinutes,
        totalMarks: q.totalMarks,
        passingMarks: q.passingMarks,
        eligible: q.eligibleCount,
        started: q.startedCount,
        submitted: q.submittedCount,
        notStarted: q.notStartedCount,
        partRate: q.participationRate / 100,
        passed: q.passedCount,
        failed: q.failedCount,
        passRate: q.passRate / 100,
        avgScore: q.avgScore,
        highScore: q.highestScore,
        lowScore: q.lowestScore,
        exited: q.terminatedByExitCount,
        timedOut: q.timedOutCount,
      });

      row.getCell(16).numFmt = '0.0%';
      row.getCell(19).numFmt = '0.0%';
      row.height = 20;
    });
    applySheetDefaults(quizSheet);

    // ─── Sheet 7: أداء هيئة التدريس / Staff Quiz Performance (NEW) ────
    const staffSheet = workbook.addWorksheet(labels.sheets.staffQuizzes);
    staffSheet.columns = [
      { header: labels.common.seq, key: 'seq', width: 6 },
      {
        header: isAr ? 'اسم عضو هيئة التدريس / المعاونة' : 'Staff Member Name',
        key: 'name',
        width: 30,
      },
      {
        header: isAr ? 'الصفة الأكاديمية' : 'Academic Title / Role',
        key: 'title',
        width: 24,
      },
      {
        header: isAr ? 'المواد المسندة' : 'Assigned Courses',
        key: 'courses',
        width: 14,
      },
      {
        header: isAr ? 'إجمالي الكويزات' : 'Total Quizzes',
        key: 'quizzes',
        width: 14,
      },
      { header: isAr ? 'منشور' : 'Published', key: 'published', width: 12 },
      { header: isAr ? 'مسودة' : 'Draft', key: 'draft', width: 12 },
      {
        header: isAr ? 'إجمالي الطلاب المستحقين' : 'Total Eligible',
        key: 'eligible',
        width: 20,
      },
      {
        header: isAr ? 'إجمالي التسليمات' : 'Total Submissions',
        key: 'submissions',
        width: 18,
      },
      {
        header: isAr ? 'متوسط نسبة الدخول' : 'Avg Participation Rate',
        key: 'partRate',
        width: 22,
      },
      {
        header: isAr ? 'متوسط نسبة النجاح' : 'Avg Pass Rate',
        key: 'passRate',
        width: 20,
      },
      {
        header: isAr ? 'متوسط الدرجات %' : 'Avg Score %',
        key: 'scorePct',
        width: 16,
      },
    ];

    staffPerf.forEach((s, idx) => {
      const displayName = formatStaffDisplayName(
        {
          name: s.staffName,
          nameAr: s.staffNameAr,
          staffType: s.staffType,
          role: s.role,
        },
        locale,
      );
      const roleLabel =
        labels.staffRoles[s.staffType || ''] ||
        labels.staffRoles[s.role || ''] ||
        s.staffType ||
        '';

      const row = staffSheet.addRow({
        seq: idx + 1,
        name: displayName,
        title: roleLabel,
        courses: s.assignedCoursesCount,
        quizzes: s.quizzesCreatedCount,
        published: s.publishedQuizzesCount,
        draft: s.draftQuizzesCount,
        eligible: s.totalEligibleStudents,
        submissions: s.totalSubmissions,
        partRate: s.avgParticipationRate / 100,
        passRate: s.avgPassRate / 100,
        scorePct: s.avgScorePercentage / 100,
      });

      row.getCell(10).numFmt = '0.0%';
      row.getCell(11).numFmt = '0.0%';
      row.getCell(12).numFmt = '0.0%';
      row.height = 20;
    });
    applySheetDefaults(staffSheet);

    // ─── Sheet 8: تحليل المقررات / Course Analysis (NEW) ──────────────
    const courseSheet = workbook.addWorksheet(labels.sheets.courses);
    courseSheet.columns = [
      { header: labels.common.seq, key: 'seq', width: 6 },
      { header: isAr ? 'كود المادة' : 'Code', key: 'code', width: 12 },
      {
        header: isAr ? 'اسم المقرر الدراسي' : 'Course Name',
        key: 'name',
        width: 30,
      },
      { header: isAr ? 'القسم' : 'Dept', key: 'dept', width: 12 },
      { header: isAr ? 'الفرقة' : 'Level', key: 'level', width: 10 },
      { header: isAr ? 'الساعات' : 'Credits', key: 'credits', width: 10 },
      { header: isAr ? 'أساتذة المقرر' : 'Doctors', key: 'doctors', width: 26 },
      {
        header: isAr ? 'الهيئة المعاونة (معيدين)' : 'Teaching Assistants',
        key: 'tas',
        width: 26,
      },
      {
        header: isAr ? 'عدد الطلاب المسجلين' : 'Enrolled Students',
        key: 'enrolled',
        width: 20,
      },
      { header: isAr ? 'عدد الكويزات' : 'Quizzes', key: 'quizzes', width: 12 },
      {
        header: isAr ? 'نسبة دخول الكويزات' : 'Quiz Participation',
        key: 'quizPart',
        width: 18,
      },
      {
        header: isAr ? 'نسبة نجاح الكويزات' : 'Quiz Pass Rate',
        key: 'quizPass',
        width: 18,
      },
      {
        header: isAr ? 'حضر الميدترم' : 'Midterm Graded',
        key: 'midGraded',
        width: 14,
      },
      {
        header: isAr ? 'غياب الميدترم' : 'Midterm Absent',
        key: 'midAbsent',
        width: 14,
      },
      {
        header: isAr ? 'نسبة نجاح الميدترم' : 'Midterm Pass %',
        key: 'midPass',
        width: 18,
      },
      {
        header: isAr ? 'حضر الفاينال' : 'Final Graded',
        key: 'finGraded',
        width: 14,
      },
      {
        header: isAr ? 'غياب الفاينال' : 'Final Absent',
        key: 'finAbsent',
        width: 14,
      },
      {
        header: isAr ? 'نسبة نجاح الفاينال' : 'Final Pass %',
        key: 'finPass',
        width: 18,
      },
      {
        header: isAr ? 'نسبة النجاح الكلية للمادة' : 'Overall Course Pass %',
        key: 'overallPass',
        width: 22,
      },
    ];

    courses.forEach((c, idx) => {
      const courseTitle =
        isAr && c.courseNameAr ? c.courseNameAr : c.courseName;
      const row = courseSheet.addRow({
        seq: idx + 1,
        code: c.courseCode,
        name: courseTitle,
        dept: c.department,
        level: c.level,
        credits: c.creditHours,
        doctors: c.doctorNames.join(', ') || '—',
        tas: c.teachingAssistantNames.join(', ') || '—',
        enrolled: c.enrolledStudentsCount,
        quizzes: c.quizzesCount,
        quizPart: c.avgQuizParticipationRate / 100,
        quizPass: c.avgQuizPassRate / 100,
        midGraded: c.midtermGradedCount,
        midAbsent: c.midtermAbsentCount,
        midPass: c.midtermPassRate / 100,
        finGraded: c.finalGradedCount,
        finAbsent: c.finalAbsentCount,
        finPass: c.finalPassRate / 100,
        overallPass: c.overallPassRate / 100,
      });

      row.getCell(11).numFmt = '0.0%';
      row.getCell(12).numFmt = '0.0%';
      row.getCell(15).numFmt = '0.0%';
      row.getCell(18).numFmt = '0.0%';
      row.getCell(19).numFmt = '0.0%';
      row.height = 20;
    });
    applySheetDefaults(courseSheet);

    // ─── Sheet 9: بيانات الطلاب الأكاديمية / Students Academic Data ────
    const studentSheet = workbook.addWorksheet(labels.sheets.students);
    studentSheet.columns = [
      { header: labels.common.seq, key: 'seq', width: 6 },
      { header: isAr ? 'كود الطالب' : 'Student Code', key: 'code', width: 16 },
      {
        header: isAr ? 'اسم الطالب (عربي)' : 'Name (Arabic)',
        key: 'nameAr',
        width: 28,
      },
      {
        header: isAr ? 'اسم الطالب (إنجليزي)' : 'Name (English)',
        key: 'nameEn',
        width: 28,
      },
      { header: isAr ? 'القسم' : 'Dept', key: 'dept', width: 12 },
      { header: isAr ? 'الفرقة' : 'Level', key: 'level', width: 10 },
      { header: labels.common.status, key: 'status', width: 18 },
      { header: isAr ? 'المعدل التراكمي (GPA)' : 'GPA', key: 'gpa', width: 16 },
      {
        header: isAr ? 'الساعات المكتسبة' : 'Earned Hours',
        key: 'hours',
        width: 14,
      },
      {
        header: isAr ? 'المواد المسجلة' : 'Registered Courses',
        key: 'regCourses',
        width: 16,
      },
      {
        header: isAr ? 'كويزات منجزة' : 'Completed Quizzes',
        key: 'quizzes',
        width: 16,
      },
      {
        header: isAr ? 'كويزات ناجحة' : 'Passed Quizzes',
        key: 'passedQuizzes',
        width: 16,
      },
      {
        header: isAr ? 'متوسط درجات الكويز %' : 'Avg Quiz Score %',
        key: 'avgScore',
        width: 20,
      },
      {
        header: isAr ? 'الشكاوى المقدمة' : 'Complaints Count',
        key: 'complaints',
        width: 16,
      },
    ];

    students.forEach((s, idx) => {
      const row = studentSheet.addRow({
        seq: idx + 1,
        code: s.studentCode,
        nameAr: s.nameAr || s.name,
        nameEn: s.name,
        dept: s.department,
        level: s.level,
        status: labels.statuses[s.enrollmentStatus] || s.enrollmentStatus,
        gpa: s.gpa != null ? s.gpa : '',
        hours: s.totalEarnedHours,
        regCourses: s.enrolledCoursesCount,
        quizzes: s.completedQuizzes,
        passedQuizzes: s.passedQuizzes,
        avgScore: s.avgQuizScorePercentage / 100,
        complaints: s.complaintsCount,
      });

      if (s.gpa != null) row.getCell(8).numFmt = '0.00';
      row.getCell(13).numFmt = '0.0%';
      row.height = 20;
    });
    applySheetDefaults(studentSheet);

    // ─── Sheet 10: نتائج الكويزات التفصيلية (إذا طُلبت) ────────────────
    if (query.includeSubmissions && detailedSubs.length > 0) {
      const subSheet = workbook.addWorksheet(labels.sheets.submissions);
      subSheet.columns = [
        { header: labels.common.seq, key: 'seq', width: 6 },
        {
          header: isAr ? 'كود الطالب' : 'Student Code',
          key: 'studentCode',
          width: 16,
        },
        {
          header: isAr ? 'اسم الطالب' : 'Student Name',
          key: 'studentName',
          width: 28,
        },
        {
          header: isAr ? 'كود المقرر' : 'Course Code',
          key: 'courseCode',
          width: 14,
        },
        {
          header: isAr ? 'اسم المقرر' : 'Course Name',
          key: 'courseName',
          width: 26,
        },
        {
          header: isAr ? 'عنوان الكويز' : 'Quiz Title',
          key: 'quizTitle',
          width: 26,
        },
        { header: isAr ? 'الدرجة المحققة' : 'Score', key: 'score', width: 14 },
        {
          header: isAr ? 'الدرجة الكلية' : 'Total Marks',
          key: 'totalMarks',
          width: 14,
        },
        { header: labels.common.percentage, key: 'percentage', width: 14 },
        { header: isAr ? 'النتيجة' : 'Result', key: 'result', width: 14 },
        {
          header: isAr ? 'تاريخ التسليم' : 'Submitted At',
          key: 'submittedAt',
          width: 22,
        },
      ];

      detailedSubs.forEach((sub, idx) => {
        const studentDisplayName =
          isAr && sub.studentNameAr ? sub.studentNameAr : sub.studentName;
        const subDate = sub.submittedAt
          ? new Intl.DateTimeFormat(isAr ? 'ar-EG' : 'en-GB', {
              timeZone: 'Africa/Cairo',
              dateStyle: 'short',
              timeStyle: 'short',
            }).format(new Date(sub.submittedAt))
          : '—';

        const row = subSheet.addRow({
          seq: idx + 1,
          studentCode: sub.studentCode,
          studentName: studentDisplayName,
          courseCode: sub.courseCode,
          courseName: sub.courseName,
          quizTitle: sub.quizTitle,
          score: sub.score,
          totalMarks: sub.totalMarks,
          percentage: (sub.percentage ?? 0) / 100,
          result: sub.isPassed ? labels.common.passed : labels.common.failed,
          submittedAt: subDate,
        });
        row.getCell(9).numFmt = '0.0%';
        row.height = 20;
      });
      applySheetDefaults(subSheet);
    }

    // ─── Sheet 11: تحليل تذاكر الشكاوى / Complaints Analysis ───────────
    const compSheet = workbook.addWorksheet(labels.sheets.complaints);
    compSheet.columns = [
      {
        header: isAr ? 'مرحلة متابعة الشكوى' : 'Complaint Stage',
        key: 'stage',
        width: 28,
      },
      {
        header: isAr ? 'عدد التذاكر' : 'Tickets Count',
        key: 'count',
        width: 16,
      },
      { header: labels.common.percentage, key: 'pct', width: 16 },
    ];

    const compStages = ['open', 'in_progress', 'resolved', 'closed'];
    const totalComp = overview.kpis.totalComplaints;
    compStages.forEach((st) => {
      let count = 0;
      if (st === 'resolved') count = overview.kpis.resolvedComplaints;
      const row = compSheet.addRow({
        stage: labels.statuses[st] || st,
        count,
        pct: totalComp > 0 ? count / totalComp : 0,
      });
      row.getCell(3).numFmt = '0.0%';
      row.height = 20;
    });
    applySheetDefaults(compSheet);

    // Auto-fit all sheets' columns
    workbook.eachSheet((s) => {
      if (s.name !== labels.sheets.info) {
        autoFitColumns(s);
      }
    });

    return workbook;
  }
}
