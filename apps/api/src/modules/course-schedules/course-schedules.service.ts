import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CourseSchedule,
  CourseScheduleDocument,
} from './schemas/course-schedule.schema';
import { Course, CourseDocument } from '../courses/schemas/course.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  CreateCourseScheduleDto,
  UpdateCourseScheduleDto,
  QueryCourseScheduleDto,
} from './dto/course-schedule.dto';
import * as ExcelJS from 'exceljs';

const DAY_ORDER: Record<string, number> = {
  saturday: 1,
  sunday: 2,
  monday: 3,
  tuesday: 4,
  wednesday: 5,
  thursday: 6,
};

function parseTimeToMinutes(t?: string | null): number | null {
  if (!t || typeof t !== 'string') return null;
  const raw = t.trim();
  if (!raw) return null;

  const match12 = raw.match(/^(\d{1,2}):(\d{2})\s*(am|pm|ص|م)?$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const modifier = (match12[3] || '').toLowerCase();
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    if (modifier === 'pm' || modifier === 'م') {
      if (hours < 12) hours += 12;
    } else if (modifier === 'am' || modifier === 'ص') {
      if (hours === 12) hours = 0;
    }
    return hours * 60 + minutes;
  }

  const match24 = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return hours * 60 + minutes;
    }
  }

  return null;
}

@Injectable()
export class CourseSchedulesService {
  constructor(
    @InjectModel(CourseSchedule.name)
    private readonly scheduleModel: Model<CourseScheduleDocument>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(dto: CreateCourseScheduleDto): Promise<CourseScheduleDocument> {
    const startMins = parseTimeToMinutes(dto.startTime);
    const endMins = parseTimeToMinutes(dto.endTime);
    if (startMins !== null && endMins !== null && endMins <= startMins) {
      throw new BadRequestException('وقت الانتهاء يجب أن يكون بعد وقت البدء');
    }

    let courseCode = dto.courseCode;
    let courseName = dto.courseName;
    let courseNameAr = dto.courseNameAr;
    let staffName = dto.staffName;
    let staffNameAr: string | undefined;
    let staffType = dto.staffType || 'doctor';

    if (Types.ObjectId.isValid(dto.courseId)) {
      const course = await this.courseModel.findById(dto.courseId).lean();
      if (course) {
        courseCode = courseCode || course.code;
        courseName = courseName || course.name;
        courseNameAr = courseNameAr || course.nameAr || course.name;
      }
    }

    if (Types.ObjectId.isValid(dto.staffId)) {
      const staffUser = await this.userModel.findById(dto.staffId).lean();
      if (staffUser) {
        staffName = staffUser.name || staffName || 'Staff Member';
        staffNameAr = (staffUser as any).nameAr || staffName;
        if ((staffUser as any).staffType) {
          staffType = (staffUser as any).staffType;
        }
      }
    }

    const schedule = new this.scheduleModel({
      ...dto,
      courseId: new Types.ObjectId(dto.courseId),
      staffId: new Types.ObjectId(dto.staffId),
      courseCode: courseCode || 'COURSE',
      courseName: courseName || 'Course',
      courseNameAr: courseNameAr || courseName || 'مقرر دراسي',
      staffName: staffName || 'Staff Member',
      staffNameAr: staffNameAr || staffName,
      staffType,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
    });

    return schedule.save();
  }

  async findAll(query: QueryCourseScheduleDto): Promise<CourseSchedule[]> {
    const filter: any = {};

    if (query.staffId && Types.ObjectId.isValid(query.staffId)) {
      filter.staffId = new Types.ObjectId(query.staffId);
    }

    if (query.courseId && Types.ObjectId.isValid(query.courseId)) {
      filter.courseId = new Types.ObjectId(query.courseId);
    }

    if (query.level && query.level !== 'all') {
      filter.level = query.level;
    }

    if (query.semester && query.semester !== 'all') {
      filter.semester = query.semester;
    }

    if (query.department && query.department !== 'all') {
      filter.department = query.department;
    }

    if (query.dayOfWeek && query.dayOfWeek !== 'all') {
      filter.dayOfWeek = query.dayOfWeek;
    }

    if (query.type && query.type !== 'all') {
      filter.type = query.type;
    }

    if (query.search) {
      const s = query.search.trim();
      filter.$or = [
        { courseCode: { $regex: s, $options: 'i' } },
        { courseName: { $regex: s, $options: 'i' } },
        { courseNameAr: { $regex: s, $options: 'i' } },
        { staffName: { $regex: s, $options: 'i' } },
        { location: { $regex: s, $options: 'i' } },
        { group: { $regex: s, $options: 'i' } },
        { section: { $regex: s, $options: 'i' } },
      ];
    }

    const items = await this.scheduleModel.find(filter).lean();
    const hydrated = await this.hydrateScheduleStaff(items as any[]);

    return hydrated.sort((a, b) => {
      const dayDiff =
        (DAY_ORDER[a.dayOfWeek] || 99) - (DAY_ORDER[b.dayOfWeek] || 99);
      if (dayDiff !== 0) return dayDiff;
      return (a.startTime || '').localeCompare(b.startTime || '');
    });
  }

  async findByStaff(staffUserId: string): Promise<CourseSchedule[]> {
    if (!Types.ObjectId.isValid(staffUserId)) return [];

    const items = await this.scheduleModel
      .find({
        staffId: new Types.ObjectId(staffUserId),
        isActive: true,
      })
      .lean();
    const hydrated = await this.hydrateScheduleStaff(items as any[]);

    return hydrated.sort((a, b) => {
      const dayDiff =
        (DAY_ORDER[a.dayOfWeek] || 99) - (DAY_ORDER[b.dayOfWeek] || 99);
      if (dayDiff !== 0) return dayDiff;
      return (a.startTime || '').localeCompare(b.startTime || '');
    });
  }

  private async hydrateScheduleStaff<T extends Record<string, any>>(
    items: T[],
  ): Promise<T[]> {
    if (!items || items.length === 0 || !this.userModel?.find) return items;
    try {
      const staffIds = Array.from(
        new Set(
          items
            .map((i) => (i.staffId ? String(i.staffId) : ''))
            .filter((id) => Types.ObjectId.isValid(id)),
        ),
      ).map((id) => new Types.ObjectId(id));
      if (staffIds.length === 0) return items;

      const users = await this.userModel
        .find({ _id: { $in: staffIds } })
        .select('_id name nameAr staffType titlePrefix')
        .lean();
      if (!Array.isArray(users) || users.length === 0) return items;

      const userMap = new Map<
        string,
        {
          name: string;
          nameAr?: string;
          staffType?: string;
          titlePrefix?: string;
        }
      >();
      for (const u of users) {
        userMap.set(String(u._id), {
          name: u.name,
          nameAr: (u as any).nameAr,
          staffType: (u as any).staffType,
          titlePrefix: (u as any).titlePrefix,
        });
      }

      return items.map((item) => {
        const u = item.staffId ? userMap.get(String(item.staffId)) : undefined;
        if (!u) return item;
        return {
          ...item,
          staffName: u.name || item.staffName,
          staffNameAr: u.nameAr || (item as any).staffNameAr || u.name,
          staffType: u.staffType || item.staffType,
          titlePrefix: u.titlePrefix || (item as any).titlePrefix,
        };
      });
    } catch {
      return items;
    }
  }

  async findOne(id: string): Promise<CourseScheduleDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('الموعد غير موجود');
    }
    const item = await this.scheduleModel.findById(id);
    if (!item) {
      throw new NotFoundException('الموعد غير موجود');
    }
    return item;
  }

  async update(
    id: string,
    dto: UpdateCourseScheduleDto,
  ): Promise<CourseScheduleDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('الموعد غير موجود');
    }

    const existing = await this.scheduleModel.findById(id);
    if (!existing) {
      throw new NotFoundException('الموعد غير موجود');
    }

    const effectiveStart =
      dto.startTime !== undefined ? dto.startTime : existing.startTime;
    const effectiveEnd =
      dto.endTime !== undefined ? dto.endTime : existing.endTime;
    const startMins = parseTimeToMinutes(effectiveStart);
    const endMins = parseTimeToMinutes(effectiveEnd);
    if (startMins !== null && endMins !== null && endMins <= startMins) {
      throw new BadRequestException('وقت الانتهاء يجب أن يكون بعد وقت البدء');
    }

    const payload: any = { ...dto };
    if (dto.courseId && Types.ObjectId.isValid(dto.courseId)) {
      payload.courseId = new Types.ObjectId(dto.courseId);
      const course = await this.courseModel.findById(dto.courseId).lean();
      if (course) {
        payload.courseCode = course.code;
        payload.courseName = course.name;
        payload.courseNameAr = course.nameAr || course.name;
      }
    }
    if (dto.staffId && Types.ObjectId.isValid(dto.staffId)) {
      payload.staffId = new Types.ObjectId(dto.staffId);
      const staffUser = await this.userModel.findById(dto.staffId).lean();
      if (staffUser) {
        payload.staffName = staffUser.name || 'Staff Member';
        payload.staffNameAr =
          (staffUser as any).nameAr || staffUser.name || 'Staff Member';
        if ((staffUser as any).staffType) {
          payload.staffType = (staffUser as any).staffType;
        }
      }
    }

    const updated = await this.scheduleModel.findByIdAndUpdate(
      id,
      { $set: payload },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('الموعد غير موجود');
    }
    return updated;
  }

  async remove(id: string): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('الموعد غير موجود');
    }
    const deleted = await this.scheduleModel.findByIdAndDelete(id);
    if (!deleted) {
      throw new NotFoundException('الموعد غير موجود');
    }
    return { message: 'تم حذف موعد المحاضرة/السكشن بنجاح' };
  }

  async clearAll(): Promise<{ message: string; deletedCount: number }> {
    const result = await this.scheduleModel.deleteMany({});
    return {
      message: 'تم مسح جميع مواعيد المحاضرات والسكاشن بنجاح',
      deletedCount: result.deletedCount || 0,
    };
  }

  /**
   * Generate standardized Excel template for lecture, section, and lab schedules.
   */
  async generateTemplate(
    format: 'xlsx' | 'csv' = 'xlsx',
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    if (format === 'csv') {
      const csvHeaders = [
        'course_code',
        'course_name',
        'doctor_code_or_username',
        'doctor_name',
        'staff_type',
        'type',
        'day_of_week',
        'start_time',
        'end_time',
        'location',
        'level',
        'department',
        'group',
        'section',
        'notes',
      ];
      const sampleRow = [
        'CS101',
        'التفكير الابتكاري',
        'dr.manar',
        'د. منار شاهين',
        'doctor',
        'lecture',
        'sunday',
        '09:00 AM',
        '11:00 AM',
        'مدرج 1',
        '1',
        'GENERAL',
        'Group A',
        '',
        'محاضرة أسبوعية',
      ];
      const csvContent =
        '\uFEFF' + [csvHeaders.join(','), sampleRow.join(',')].join('\n');
      return {
        buffer: Buffer.from(csvContent, 'utf-8'),
        contentType: 'text/csv; charset=utf-8',
        filename: 'lecture-schedules-template.csv',
      };
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BH47A Student Portal';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('جدول المحاضرات والسكاشن', {
      views: [{ rightToLeft: true }],
    });

    sheet.columns = [
      { header: 'كود المقرر (course_code)', key: 'course_code', width: 22 },
      { header: 'اسم المقرر (course_name)', key: 'course_name', width: 26 },
      {
        header: 'كود أو يوزرنيم الدكتور/المعيد (doctor_username)',
        key: 'doctor_username',
        width: 30,
      },
      {
        header: 'اسم الدكتور / المعيد (doctor_name)',
        key: 'doctor_name',
        width: 25,
      },
      {
        header: 'الصفة (staff_type: doctor / teaching_assistant)',
        key: 'staff_type',
        width: 25,
      },
      {
        header: 'نوع الموعد (type: lecture/section/lab)',
        key: 'type',
        width: 24,
      },
      {
        header: 'اليوم (day_of_week: sunday..thursday)',
        key: 'day_of_week',
        width: 24,
      },
      {
        header: 'وقت البدء (start_time e.g. 09:00 AM)',
        key: 'start_time',
        width: 22,
      },
      {
        header: 'وقت الانتهاء (end_time e.g. 11:00 AM)',
        key: 'end_time',
        width: 22,
      },
      {
        header: 'المكان / القاعة / المعمل (location)',
        key: 'location',
        width: 24,
      },
      { header: 'المستوى (level: 1..4)', key: 'level', width: 16 },
      {
        header: 'القسم (department e.g. GENERAL/BIS)',
        key: 'department',
        width: 20,
      },
      { header: 'المجموعة / الدفعة (group)', key: 'group', width: 18 },
      { header: 'السكشن (section)', key: 'section', width: 16 },
      { header: 'ملاحظات (notes)', key: 'notes', width: 22 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.height = 32;
    headerRow.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
      size: 11,
      name: 'Segoe UI',
    };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0D9488' }, // Dark Teal
    };
    headerRow.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };

    // Add realistic sample rows
    const sampleRows = [
      {
        course_code: 'CS101',
        course_name: 'التفكير الابتكاري',
        doctor_username: 'dr.manar',
        doctor_name: 'د. منار شاهين',
        staff_type: 'doctor',
        type: 'lecture',
        day_of_week: 'sunday',
        start_time: '09:00 AM',
        end_time: '11:00 AM',
        location: 'مدرج 1',
        level: '1',
        department: 'GENERAL',
        group: 'Group A',
        section: '',
        notes: 'محاضرة أسبوعية عامة',
      },
      {
        course_code: 'CS101',
        course_name: 'التفكير الابتكاري',
        doctor_username: 'ahmed.ta',
        doctor_name: 'أ. أحمد حسن',
        staff_type: 'teaching_assistant',
        type: 'section',
        day_of_week: 'monday',
        start_time: '11:30 AM',
        end_time: '01:00 PM',
        location: 'قاعة 204',
        level: '1',
        department: 'GENERAL',
        group: 'Group A',
        section: 'Section 1',
        notes: 'سكشن تطبيقي',
      },
      {
        course_code: 'BIS201',
        course_name: 'نظم المعلومات الإدارية',
        doctor_username: 'dr.mohamed',
        doctor_name: 'د. محمد علي',
        staff_type: 'doctor',
        type: 'lecture',
        day_of_week: 'tuesday',
        start_time: '10:00 AM',
        end_time: '12:00 PM',
        location: 'مدرج 2',
        level: '2',
        department: 'BIS',
        group: 'Group 1',
        section: '',
        notes: 'محاضرة رئيسية',
      },
      {
        course_code: 'BIS202',
        course_name: 'قواعد البيانات والمعامل',
        doctor_username: 'eng.sara',
        doctor_name: 'م. سارة خليل',
        staff_type: 'teaching_assistant',
        type: 'lab',
        day_of_week: 'wednesday',
        start_time: '01:00 PM',
        end_time: '03:00 PM',
        location: 'معمل الحاسب 3',
        level: '2',
        department: 'BIS',
        group: 'Group 1',
        section: 'Lab 2',
        notes: 'معمل تدريب عملي',
      },
    ];

    sampleRows.forEach((row) => {
      const addedRow = sheet.addRow(row);
      addedRow.height = 24;
      addedRow.alignment = { vertical: 'middle', horizontal: 'center' };
      addedRow.font = { name: 'Segoe UI', size: 10 };
    });

    const uint8Array = await workbook.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(uint8Array),
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: 'lecture-schedules-template.xlsx',
    };
  }

  /**
   * Bulk import schedules from uploaded Excel or CSV workbook.
   */
  async importFromExcel(
    buffer: Buffer,
    originalname: string,
  ): Promise<{
    totalRows: number;
    insertedCount: number;
    updatedCount: number;
    errorCount: number;
    errors: string[];
  }> {
    const rawRows = await this.parseWorkbookRows(buffer, originalname);
    if (rawRows.length === 0) {
      return {
        totalRows: 0,
        insertedCount: 0,
        updatedCount: 0,
        errorCount: 1,
        errors: ['الملف فارغ أو لا يحتوي على صفوف بيانات صالحة'],
      };
    }

    // Preload courses & staff for fast memory matching
    const [allCourses, allStaffUsers] = await Promise.all([
      this.courseModel.find({}).lean(),
      this.userModel.find({ role: { $in: ['staff', 'admin'] } }).lean(),
    ]);

    let insertedCount = 0;
    let updatedCount = 0;
    const errors: string[] = [];

    const DAY_MAP: Record<string, string> = {
      saturday: 'saturday',
      sunday: 'sunday',
      monday: 'monday',
      tuesday: 'tuesday',
      wednesday: 'wednesday',
      thursday: 'thursday',
      السبت: 'saturday',
      الأحد: 'sunday',
      الاحد: 'sunday',
      الاثنين: 'monday',
      الإثنين: 'monday',
      الثلاثاء: 'tuesday',
      الأربعاء: 'wednesday',
      الاربعاء: 'wednesday',
      الخميس: 'thursday',
    };

    const TYPE_MAP: Record<string, 'lecture' | 'section' | 'lab'> = {
      lecture: 'lecture',
      section: 'section',
      lab: 'lab',
      محاضرة: 'lecture',
      محاضره: 'lecture',
      سكشن: 'section',
      معمل: 'lab',
      مختبر: 'lab',
    };

    const STAFF_TYPE_MAP: Record<
      string,
      'doctor' | 'teaching_assistant' | 'assistant_lecturer'
    > = {
      doctor: 'doctor',
      dr: 'doctor',
      teaching_assistant: 'teaching_assistant',
      assistant_lecturer: 'assistant_lecturer',
      ta: 'teaching_assistant',
      دكتور: 'doctor',
      دكتورة: 'doctor',
      استاذ: 'doctor',
      أستاذ: 'doctor',
      معيد: 'teaching_assistant',
      معيدة: 'teaching_assistant',
      'مدرس مساعد': 'assistant_lecturer',
      مهندس: 'teaching_assistant',
      مهندسة: 'teaching_assistant',
    };

    for (let index = 0; index < rawRows.length; index++) {
      const row = rawRows[index];
      const rowNum = index + 2; // header is row 1

      // 1. Resolve Course Code & Course
      const rawCourseCode = this.extractFieldValue(row, [
        'course_code',
        'coursecode',
        'code',
        'كود المقرر',
        'كود_المقرر',
        'كود المادة',
      ]);

      const rawCourseName = this.extractFieldValue(row, [
        'course_name',
        'coursename',
        'اسم المقرر',
        'اسم المادة',
      ]);

      if (!rawCourseCode && !rawCourseName) {
        errors.push(`السطر ${rowNum}: لم يتم تحديد كود المقرر أو اسمه`);
        continue;
      }

      // Match course in preloaded list
      let matchedCourse = allCourses.find(
        (c) =>
          rawCourseCode &&
          c.code &&
          c.code.trim().toLowerCase() === rawCourseCode.trim().toLowerCase(),
      );

      if (!matchedCourse && rawCourseName) {
        matchedCourse = allCourses.find(
          (c) =>
            (c.name &&
              c.name.trim().toLowerCase() ===
                rawCourseName.trim().toLowerCase()) ||
            (c.nameAr &&
              c.nameAr.trim().toLowerCase() ===
                rawCourseName.trim().toLowerCase()),
        );
      }

      if (!matchedCourse) {
        errors.push(
          `السطر ${rowNum}: لم يتم العثور على المقرر بكود "${rawCourseCode || rawCourseName}" في قاعدة البيانات`,
        );
        continue;
      }

      // 2. Resolve Doctor / Staff Member
      const rawStaffIdentifier = this.extractFieldValue(row, [
        'doctor_username',
        'doctor_code_or_username',
        'staff_username',
        'username',
        'doctor_code',
        'staff_code',
        'كود الدكتور',
        'يوزرنيم الدكتور',
        'اسم مستخدم الدكتور',
      ]);

      const rawStaffName = this.extractFieldValue(row, [
        'doctor_name',
        'staff_name',
        'اسم الدكتور',
        'اسم المحاضر',
        'اسم المعيد',
        'القائم بالتدريس',
      ]);

      const rawStaffType = this.extractFieldValue(row, [
        'staff_type',
        'stafftype',
        'role',
        'الصفة',
        'نوع المحاضر',
      ]).toLowerCase();

      let matchedStaff = allStaffUsers.find(
        (s) =>
          rawStaffIdentifier &&
          ((s.username &&
            s.username.trim().toLowerCase() ===
              rawStaffIdentifier.trim().toLowerCase()) ||
            (s.email &&
              s.email.trim().toLowerCase() ===
                rawStaffIdentifier.trim().toLowerCase()) ||
            ((s as any).code &&
              String((s as any).code)
                .trim()
                .toLowerCase() === rawStaffIdentifier.trim().toLowerCase())),
      );

      if (!matchedStaff && rawStaffName) {
        matchedStaff = allStaffUsers.find(
          (s) =>
            (s.name &&
              s.name
                .trim()
                .toLowerCase()
                .includes(rawStaffName.trim().toLowerCase())) ||
            ((s as any).nameAr &&
              (s as any).nameAr
                .trim()
                .toLowerCase()
                .includes(rawStaffName.trim().toLowerCase())),
        );
      }

      // Fallback if no matching user found: use institute first staff/admin or assigned ID
      const staffId = matchedStaff ? matchedStaff._id : allStaffUsers[0]?._id;

      if (!staffId) {
        errors.push(
          `السطر ${rowNum}: لا يوجد أي عضو هيئة تدريس مسجل في النظام`,
        );
        continue;
      }

      const staffName =
        rawStaffName ||
        (matchedStaff as any)?.nameAr ||
        matchedStaff?.name ||
        'Staff Member';

      const staffType =
        STAFF_TYPE_MAP[rawStaffType] ||
        (matchedStaff as any)?.staffType ||
        'doctor';

      // 3. Resolve Slot Type (lecture | section | lab)
      const rawType = this.extractFieldValue(row, [
        'type',
        'slot_type',
        'النوع',
        'نوع الموعد',
        'نوع المحاضرة',
      ]).toLowerCase();

      const type: 'lecture' | 'section' | 'lab' =
        TYPE_MAP[rawType] ||
        (rawType.includes('lab') || rawType.includes('معمل')
          ? 'lab'
          : rawType.includes('sec') || rawType.includes('سكشن')
            ? 'section'
            : 'lecture');

      // 4. Resolve Day of Week
      const rawDay = this.extractFieldValue(row, [
        'day_of_week',
        'day',
        'اليوم',
        'يوم المحاضرة',
      ]).toLowerCase();

      const normalizedDay = DAY_MAP[rawDay] as
        | 'saturday'
        | 'sunday'
        | 'monday'
        | 'tuesday'
        | 'wednesday'
        | 'thursday'
        | undefined;

      if (!normalizedDay) {
        errors.push(
          `السطر ${rowNum}: اليوم "${rawDay}" غير صالح. الأيام المقبولة: السبت، الأحد، الاثنين، الثلاثاء، الأربعاء، الخميس`,
        );
        continue;
      }

      // 5. Resolve Timings & Location
      const startTime = this.extractFieldValue(row, [
        'start_time',
        'starttime',
        'start',
        'وقت البدء',
        'وقت البداية',
        'من الساعة',
      ]);

      const endTime = this.extractFieldValue(row, [
        'end_time',
        'endtime',
        'end',
        'وقت الانتهاء',
        'وقت النهاية',
        'إلى الساعة',
      ]);

      const location = this.extractFieldValue(row, [
        'location',
        'hall',
        'room',
        'place',
        'المكان',
        'القاعة',
        'المدرج',
        'المعمل',
      ]);

      if (!startTime || !endTime || !location) {
        errors.push(
          `السطر ${rowNum}: يلزم تحديد وقت البداية، وقت النهاية، واسم القاعة/المكان`,
        );
        continue;
      }

      // 6. Optional level, department, group, section, notes
      const level =
        this.extractFieldValue(row, [
          'level',
          'year',
          'المستوى',
          'الفرقة',
          'السنة',
        ]) || String(matchedCourse.level ?? '1');

      const department =
        this.extractFieldValue(row, ['department', 'القسم', 'التخصص']) ||
        matchedCourse.department ||
        'GENERAL';

      const rawSemester =
        this.extractFieldValue(row, ['semester', 'الفصل', 'الترم']) || 'first';
      const semester =
        rawSemester === '2' ||
        rawSemester.toLowerCase() === 'second' ||
        rawSemester.includes('ثان')
          ? 'second'
          : rawSemester === '3' ||
              rawSemester.toLowerCase() === 'summer' ||
              rawSemester.includes('صيف')
            ? 'summer'
            : 'first';

      const group = this.extractFieldValue(row, [
        'group',
        'المجموعة',
        'الدفعة',
      ]);
      const section = this.extractFieldValue(row, ['section', 'السكشن']);
      const notes = this.extractFieldValue(row, ['notes', 'ملاحظات']);

      // 7. Check for existing slot to update or create
      try {
        const queryExisting: any = {
          courseId: matchedCourse._id,
          dayOfWeek: normalizedDay,
          startTime,
          location,
        };
        if (group) queryExisting.group = group;
        if (section) queryExisting.section = section;

        const existingSlot = await this.scheduleModel.findOne(queryExisting);

        if (existingSlot) {
          existingSlot.staffId = staffId;
          existingSlot.staffName = staffName;
          existingSlot.staffType = staffType;
          existingSlot.type = type;
          existingSlot.endTime = endTime;
          existingSlot.level = level;
          existingSlot.department = department;
          existingSlot.semester = semester;
          if (group) existingSlot.group = group;
          if (section) existingSlot.section = section;
          if (notes) existingSlot.notes = notes;
          await existingSlot.save();
          updatedCount++;
        } else {
          await this.scheduleModel.create({
            courseId: matchedCourse._id,
            courseCode: matchedCourse.code,
            courseName: matchedCourse.name,
            courseNameAr: matchedCourse.nameAr || matchedCourse.name,
            staffId,
            staffName,
            staffType,
            type,
            dayOfWeek: normalizedDay,
            startTime,
            endTime,
            location,
            level,
            semester,
            department,
            group: group || undefined,
            section: section || undefined,
            notes: notes || undefined,
            isActive: true,
          });
          insertedCount++;
        }
      } catch (rowErr: unknown) {
        const msg =
          rowErr instanceof Error ? rowErr.message : 'تعذر حفظ موعد الجدول';
        errors.push(`السطر ${rowNum}: ${msg}`);
      }
    }

    return {
      totalRows: rawRows.length,
      insertedCount,
      updatedCount,
      errorCount: errors.length,
      errors: errors.slice(0, 15), // return top 15 errors to avoid huge responses
    };
  }

  private cleanString(val: any): string {
    if (val === null || val === undefined) return '';
    if (val instanceof Date) {
      if (Number.isNaN(val.getTime())) return '';
      const hours = val.getUTCHours();
      const minutes = val.getUTCMinutes();
      const period = hours >= 12 ? 'PM' : 'AM';
      const h12 = hours % 12 || 12;
      return `${String(h12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
    }
    if (typeof val === 'object') {
      if ('error' in val) return '';
      if ('result' in val && val.result !== undefined) {
        return this.cleanString(val.result);
      }
      if ('richText' in val && Array.isArray(val.richText)) {
        return val.richText
          .map((p: any) => String(p?.text ?? ''))
          .join('')
          .trim();
      }
      if ('text' in val && val.text !== undefined) {
        return this.cleanString(val.text);
      }
      return '';
    }
    return String(val)
      .replace(/^\uFEFF/, '')
      .trim();
  }

  private extractFieldValue(
    row: Record<string, any>,
    possibleKeys: string[],
  ): string {
    const entries = Object.entries(row);

    // Pass 1: exact match on cleaned header or parenthetical token
    for (const key of possibleKeys) {
      const cleanKey = key.toLowerCase().replace(/[\s_\-()]/g, '');
      for (const [rowKey, rowValue] of entries) {
        const cleanRowKey = rowKey.toLowerCase().replace(/[\s_\-()]/g, '');
        const beforeParen = rowKey
          .split('(')[0]
          .toLowerCase()
          .replace(/[\s_\-()]/g, '');
        const parenMatch = rowKey.match(/\(([^)]+)\)/);
        const insideParenFirstToken = parenMatch
          ? parenMatch[1]
              .split(/[:\s]/)[0]
              .toLowerCase()
              .replace(/[\s_\-()]/g, '')
          : '';
        if (
          cleanRowKey === cleanKey ||
          beforeParen === cleanKey ||
          (insideParenFirstToken && insideParenFirstToken === cleanKey)
        ) {
          if (rowValue !== undefined && rowValue !== null) {
            return this.cleanString(rowValue);
          }
        }
      }
    }

    // Pass 2: substring match only for longer keys (>= 6 chars) to prevent 'type'/'name' collisions
    for (const key of possibleKeys) {
      const cleanKey = key.toLowerCase().replace(/[\s_\-()]/g, '');
      if (cleanKey.length < 6) continue;
      for (const [rowKey, rowValue] of entries) {
        const cleanRowKey = rowKey.toLowerCase().replace(/[\s_\-()]/g, '');
        if (cleanRowKey.includes(cleanKey)) {
          if (rowValue !== undefined && rowValue !== null) {
            return this.cleanString(rowValue);
          }
        }
      }
    }
    return '';
  }

  private parseCsvText(text: string): Record<string, any>[] {
    const lines = text
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length <= 1) return [];

    const headers = lines[0].split(/[,;\t]/).map((h) =>
      this.cleanString(h)
        .replace(/^["']|["']$/g, '')
        .toLowerCase(),
    );

    const rows: Record<string, any>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i]
        .split(/[,;\t]/)
        .map((p) => this.cleanString(p).replace(/^["']|["']$/g, ''));
      if (parts.some((p) => p.length > 0)) {
        const rowData: Record<string, any> = {};
        headers.forEach((h, idx) => {
          if (h) rowData[h] = parts[idx] ?? '';
        });
        rows.push(rowData);
      }
    }
    return rows;
  }

  private async parseWorkbookRows(
    buffer: Buffer,
    originalname: string,
  ): Promise<Record<string, any>[]> {
    const isCsv = originalname.toLowerCase().endsWith('.csv');

    if (isCsv) {
      return this.parseCsvText(buffer.toString('utf-8'));
    }

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);
      const sheet = workbook.worksheets[0];
      if (!sheet || sheet.rowCount <= 1) return [];

      const rows: Record<string, any>[] = [];
      let headers: string[] = [];

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          const values = row.values as any[];
          headers = (Array.isArray(values) ? values.slice(1) : []).map((v) =>
            this.cleanString(v).toLowerCase(),
          );
          return;
        }

        const values = row.values as any[];
        if (!Array.isArray(values)) return;

        const rowData: Record<string, any> = {};
        let hasData = false;
        headers.forEach((h, idx) => {
          if (!h) return;
          const cellStr = this.cleanString(values[idx + 1]);
          if (cellStr !== '') {
            hasData = true;
            rowData[h] = cellStr;
          }
        });

        if (hasData) {
          rows.push(rowData);
        }
      });

      return rows;
    } catch {
      const fallbackRows = this.parseCsvText(buffer.toString('utf-8'));
      if (fallbackRows.length > 0) return fallbackRows;
      throw new BadRequestException(
        'يتعذر قراءة ملف الجدول. يرجى التأكد من أن الملف بصيغة .xlsx أو .csv صالحة',
      );
    }
  }
}
