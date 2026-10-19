import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { CacheService } from '../../core/cache/cache.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import { Course, CourseDocument } from './schemas/course.schema';
import {
  CreateCourseDto,
  UpdateCourseDto,
  QueryCourseDto,
} from './dto/course.dto';
import {
  buildPaginationOptions,
  createPaginatedResult,
} from '../../common/utils/pagination.util';
import { normalizeSearchTerm } from '../../common/utils/search.util';
import {
  CourseRegistration,
  CourseRegistrationDocument,
} from '../registrations/schemas/course-registration.schema';
import {
  StudentProfile,
  StudentProfileDocument,
} from '../students/schemas/student-profile.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import * as ExcelJS from 'exceljs';

export interface CourseSyllabusFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface StudentSyllabiResponse {
  studentLevel: string;
  registeredCount: number;
  registeredCourses: Array<Record<string, unknown> & { isRegistered: boolean }>;
  availableLevelCourses: Array<
    Record<string, unknown> & { isRegistered: boolean }
  >;
}

@Injectable()
export class CoursesService {
  constructor(
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(CourseRegistration.name)
    private courseRegistrationModel: Model<CourseRegistrationDocument>,
    @InjectModel(StudentProfile.name)
    private studentProfileModel: Model<StudentProfileDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private configService: ConfigService,
    @Optional() private cacheService?: CacheService,
  ) {}

  async create(dto: CreateCourseDto): Promise<CourseDocument> {
    const existing = await this.courseModel.findOne({
      code: dto.code.toUpperCase(),
    });
    if (existing) {
      throw new ConflictException('كود المادة موجود بالفعل'); // Course code already exists
    }

    let doctorName: string | undefined;
    let doctorNameAr: string | undefined;
    let doctorObjectId: Types.ObjectId | undefined;
    if (dto.doctorId) {
      if (Types.ObjectId.isValid(dto.doctorId)) {
        doctorObjectId = new Types.ObjectId(dto.doctorId);
        const doctorUser = await this.userModel.findById(doctorObjectId).lean();
        if (doctorUser) {
          doctorName = doctorUser.name;
          doctorNameAr = (doctorUser as any).nameAr || doctorUser.name;
        }
      }
    }

    const course = new this.courseModel({
      ...dto,
      code: dto.code.toUpperCase(),
      academicLevel: dto.academicLevel ?? dto.level,
      level: dto.level ?? dto.academicLevel,
      prerequisites: dto.prerequisites?.map((code) => code.toUpperCase()) ?? [],
      type: dto.type ?? 'required',
      doctorId: doctorObjectId,
      doctorName,
      doctorNameAr,
    });
    const saved = await course.save();
    void this.cacheService?.delPattern('courses:*');
    return saved;
  }

  async findAll(query: QueryCourseDto, caller?: any) {
    const { page, limit, skip } = buildPaginationOptions(query);
    const filter: any = {};

    if (
      caller?.role === 'staff' &&
      caller?.staffType === 'doctor' &&
      caller?._id
    ) {
      if (Types.ObjectId.isValid(caller._id)) {
        filter.doctorId = new Types.ObjectId(caller._id);
      }
    } else if (query.doctorId && Types.ObjectId.isValid(query.doctorId)) {
      filter.doctorId = new Types.ObjectId(query.doctorId);
    }

    if (query.search) {
      const search = normalizeSearchTerm(query.search);
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { nameAr: { $regex: search, $options: 'i' } },
        { nameEn: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }

    if (query.level) {
      filter.level = query.level;
    }

    if (query.academicLevel) {
      filter.academicLevel = query.academicLevel;
    }

    if (query.semester) {
      filter.semester = query.semester;
    }

    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    const cacheKey = !query.search
      ? `courses:list:${query.doctorId || 'all'}:${query.level || 'all'}:${query.academicLevel || 'all'}:${query.semester || 'all'}:${query.isActive ?? 'all'}:${page}:${limit}`
      : null;

    if (cacheKey && this.cacheService) {
      return this.cacheService.wrap(
        cacheKey,
        async () => {
          const [items, total] = await Promise.all([
            this.courseModel
              .find(filter)
              .sort({ code: 1 })
              .skip(skip)
              .limit(limit)
              .lean(),
            this.courseModel.countDocuments(filter),
          ]);
          return createPaginatedResult(items, total, page, limit);
        },
        120,
      );
    }

    const [items, total] = await Promise.all([
      this.courseModel
        .find(filter)
        .sort({ code: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.courseModel.countDocuments(filter),
    ]);

    return createPaginatedResult(items, total, page, limit);
  }

  async findOne(id: string): Promise<CourseDocument> {
    const course = await this.courseModel.findById(id);
    if (!course) {
      throw new NotFoundException('المادة غير موجودة'); // Course not found
    }
    return course;
  }

  async update(id: string, dto: UpdateCourseDto): Promise<CourseDocument> {
    const course = await this.findOne(id);

    if (dto.code && dto.code.toUpperCase() !== course.code) {
      const existing = await this.courseModel.findOne({
        code: dto.code.toUpperCase(),
      });
      if (existing) {
        throw new ConflictException('كود المادة موجود بالفعل');
      }
      dto.code = dto.code.toUpperCase();
    }

    if (dto.level && !dto.academicLevel) {
      dto.academicLevel = dto.level;
    }

    if (dto.academicLevel && !dto.level) {
      dto.level = dto.academicLevel;
    }

    if (dto.prerequisites) {
      dto.prerequisites = dto.prerequisites.map((code) => code.toUpperCase());
    }

    const updatePayload: Record<string, any> = { ...dto };
    if (dto.syllabusPdfUrl === null || dto.syllabusPdfUrl === '') {
      updatePayload.syllabusPdfUrl = null;
      updatePayload.syllabusPdfName = null;
    }
    if (dto.coverImageUrl === null || dto.coverImageUrl === '') {
      updatePayload.coverImageUrl = null;
    }

    if (dto.doctorId !== undefined) {
      if (dto.doctorId && Types.ObjectId.isValid(dto.doctorId)) {
        const doctorObjectId = new Types.ObjectId(dto.doctorId);
        const doctorUser = await this.userModel.findById(doctorObjectId).lean();
        if (doctorUser) {
          updatePayload.doctorId = doctorObjectId;
          updatePayload.doctorName = doctorUser.name;
          updatePayload.doctorNameAr =
            (doctorUser as any).nameAr || doctorUser.name;
        }
      } else {
        updatePayload.doctorId = null;
        updatePayload.doctorName = null;
        updatePayload.doctorNameAr = null;
      }
    }

    const updated = await this.courseModel.findByIdAndUpdate(
      id,
      { $set: updatePayload },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('المادة غير موجودة');
    }
    void this.cacheService?.delPattern('courses:*');
    return updated;
  }

  async findDoctorCourses(
    doctorId: string,
  ): Promise<
    Array<Record<string, unknown> & { enrolledStudentsCount: number }>
  > {
    if (!Types.ObjectId.isValid(doctorId)) return [];
    const courses = (await this.courseModel
      .find({ doctorId: new Types.ObjectId(doctorId), isActive: true })
      .lean()) as unknown as Array<
      Record<string, unknown> & { _id: Types.ObjectId; code: string }
    >;

    if (!courses || courses.length === 0) return [];

    const courseCodes = courses.map((c) => String(c.code).toUpperCase());
    const courseIdStrs = courses.map((c) => c._id.toString());
    const allMatches = [...courseCodes, ...courseIdStrs];

    const approvedRegistrations = await this.courseRegistrationModel
      .find({
        status: 'approved',
        courses: { $in: allMatches },
      })
      .select('courses')
      .lean();

    const countMap: Record<string, number> = {};
    for (const reg of approvedRegistrations) {
      const regCourses = (reg.courses || []).map((c: string) =>
        c.toUpperCase(),
      );
      for (const course of courses) {
        const cCode = String(course.code).toUpperCase();
        const cId = course._id.toString();
        if (
          regCourses.includes(cCode) ||
          regCourses.includes(cId.toUpperCase())
        ) {
          countMap[cId] = (countMap[cId] || 0) + 1;
        }
      }
    }

    return courses.map((c) => ({
      ...c,
      enrolledStudentsCount: countMap[c._id.toString()] || 0,
    }));
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findOne(id);
    await this.courseModel.findByIdAndDelete(id);
    void this.cacheService?.delPattern('courses:*');
    return { message: 'تم حذف المادة بنجاح' }; // Course deleted successfully
  }

  private getCloudinaryConfig() {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      return null;
    }

    return { cloudName, apiKey, apiSecret };
  }

  private createCloudinarySignature(
    params: Record<string, string>,
    apiSecret: string,
  ) {
    const normalizedParams = Object.entries(params)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    return createHash('sha1')
      .update(`${normalizedParams}${apiSecret}`)
      .digest('hex');
  }

  async uploadSyllabus(courseId: string, file: CourseSyllabusFile) {
    const course = await this.findOne(courseId);

    const isPdf =
      file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);

    if (!isPdf) {
      throw new BadRequestException('يجب أن يكون الملف بصيغة PDF فقط');
    }

    let cleanOriginalName = file.originalname;
    try {
      cleanOriginalName = Buffer.from(file.originalname, 'latin1').toString(
        'utf8',
      );
    } catch {
      cleanOriginalName = file.originalname;
    }

    const config = this.getCloudinaryConfig();
    let fileUrl: string;

    if (config) {
      const { cloudName, apiKey, apiSecret } = config;
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const folder = 'course-syllabi';
      const accessMode = 'public';
      const signature = this.createCloudinarySignature(
        { access_mode: accessMode, folder, timestamp },
        apiSecret,
      );

      const safeFilename = `syllabus_${course.code || 'course'}_${Date.now()}.pdf`;
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([new Uint8Array(file.buffer)], {
          type: file.mimetype || 'application/pdf',
        }),
        safeFilename,
      );
      formData.append('api_key', apiKey);
      formData.append('folder', folder);
      formData.append('timestamp', timestamp);
      formData.append('access_mode', accessMode);
      formData.append('signature', signature);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
        {
          method: 'POST',
          body: formData,
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new BadRequestException(
          `فشل رفع ملف المنهج إلى السحابة: ${errorText || response.statusText}`,
        );
      }

      const result = (await response.json()) as { secure_url?: string };
      if (!result.secure_url) {
        throw new BadRequestException('لم يتم استلام رابط الملف من السحابة');
      }
      fileUrl = result.secure_url;

      // When CDN is configured, store URL only and clear any heavy binary buffer from DB
      course.syllabusPdfUrl = fileUrl;
      course.syllabusPdfName = cleanOriginalName;
      course.syllabusPdfData = undefined;
      course.syllabusUpdatedAt = new Date();
    } else {
      // Local development fallback without Cloudinary: guard against MongoDB 16MB document size limit
      if (file.buffer.length > 5 * 1024 * 1024) {
        throw new BadRequestException(
          'حجم الملف يتجاوز الحد المسموح به (5 ميجابايت) للتخزين المحلي. يرجى تفعيل مفاتيح Cloudinary',
        );
      }
      const base64 = Buffer.from(file.buffer).toString('base64');
      fileUrl = `data:application/pdf;base64,${base64}`;

      course.syllabusPdfUrl = fileUrl;
      course.syllabusPdfName = cleanOriginalName;
      course.syllabusPdfData = base64;
      course.syllabusUpdatedAt = new Date();
    }

    // Automatically derive CoverBook thumbnail from page 1 of Cloudinary PDF if no custom cover was uploaded
    if (!course.coverImageUrl && fileUrl.includes('res.cloudinary.com')) {
      course.coverImageUrl = fileUrl
        .replace(
          '/raw/upload/',
          '/image/upload/pg_1,w_400,h_560,c_fill,f_auto,q_auto/',
        )
        .replace(/\.pdf$/i, '.jpg');
    }

    await course.save();

    return {
      message: 'تم رفع وتحديث منهج المقرر بنجاح',
      courseId: course._id.toString(),
      courseCode: course.code,
      syllabusPdfUrl: course.syllabusPdfUrl,
      syllabusPdfName: course.syllabusPdfName,
      syllabusUpdatedAt: course.syllabusUpdatedAt,
      coverImageUrl: course.coverImageUrl,
    };
  }

  async downloadSyllabus(courseId: string, res: any, caller?: any) {
    if (caller && caller.role === 'student') {
      const studentProfile = await this.studentProfileModel
        .findOne({ userId: caller._id })
        .lean();
      if (studentProfile?.isBlocked) {
        throw new ForbiddenException(
          'عفواً، لا يمكنك تحميل منهج المقرر الدراسي نظراً لحجب الحساب لعدم سداد المصروفات الدراسية. يرجى مراجعة إدارة المعهد.',
        );
      }
    }

    const course = await this.courseModel
      .findById(courseId)
      .select('+syllabusPdfData')
      .exec();

    if (!course || (!course.syllabusPdfUrl && !course.syllabusPdfData)) {
      throw new NotFoundException('لم يتم رفع ملف المنهج لهذا المقرر بعد');
    }

    const fallbackFilename = `syllabus_${course.code || 'course'}.pdf`;
    const safeFilename = encodeURIComponent(
      course.syllabusPdfName || fallbackFilename,
    );

    // High performance caching headers for edge CDNs and browsers
    res.setHeader(
      'Cache-Control',
      'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
    );
    res.setHeader('Accept-Ranges', 'bytes');

    // 1. If stored locally in DB (dev/offline fallback), serve buffer
    if (course.syllabusPdfData) {
      const buffer = Buffer.from(course.syllabusPdfData, 'base64');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
      );
      return res.send(buffer);
    }

    if (course.syllabusPdfUrl?.startsWith('data:application/pdf;base64,')) {
      const base64Data = course.syllabusPdfUrl.replace(
        'data:application/pdf;base64,',
        '',
      );
      const buffer = Buffer.from(base64Data, 'base64');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
      );
      return res.send(buffer);
    }

    // 2. High-performance streaming proxy for Cloudinary/external URLs with zero buffer duplication
    if (course.syllabusPdfUrl) {
      try {
        const headers: Record<string, string> = {};
        const config = this.getCloudinaryConfig();
        if (config && course.syllabusPdfUrl.includes('res.cloudinary.com')) {
          headers['Authorization'] =
            `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64')}`;
        }
        const upstream = await fetch(course.syllabusPdfUrl, { headers });
        if (upstream.ok && upstream.body) {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader(
            'Content-Disposition',
            `inline; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
          );

          // Stream upstream body directly into Express response (O(1) constant RAM usage)
          // Node 18+ Web ReadableStream to Node Readable
          const nodeStream = Readable.fromWeb(upstream.body as any);
          return nodeStream.pipe(res);
        }
      } catch (err) {
        console.warn(
          'Streaming proxy fetch for syllabus PDF failed, redirecting:',
          err,
        );
      }

      return res.redirect(302, course.syllabusPdfUrl);
    }

    throw new NotFoundException('ملف المنهج غير متوفر حالياً');
  }

  async uploadCoverImage(
    courseId: string,
    file: CourseSyllabusFile,
  ): Promise<{
    message: string;
    courseId: string;
    courseCode: string;
    coverImageUrl: string;
  }> {
    const course = await this.findOne(courseId);

    const isImage =
      file.mimetype.startsWith('image/') ||
      /\.(jpg|jpeg|png|webp|avif)$/i.test(file.originalname);

    if (!isImage) {
      throw new BadRequestException(
        'يجب أن يكون ملف الغلاف صورة بصيغة (JPG, PNG, WEBP) فقط',
      );
    }

    const config = this.getCloudinaryConfig();
    let fileUrl: string;

    if (config) {
      const { cloudName, apiKey, apiSecret } = config;
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const folder = 'course-covers';
      const signature = this.createCloudinarySignature(
        { folder, timestamp },
        apiSecret,
      );

      const ext = file.originalname.split('.').pop() || 'jpg';
      const safeFilename = `cover_${course.code || 'course'}_${Date.now()}.${ext}`;
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([new Uint8Array(file.buffer)], {
          type: file.mimetype || 'image/jpeg',
        }),
        safeFilename,
      );
      formData.append('api_key', apiKey);
      formData.append('folder', folder);
      formData.append('timestamp', timestamp);
      formData.append('signature', signature);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: 'POST',
          body: formData,
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new BadRequestException(
          `فشل رفع صورة الغلاف إلى السحابة: ${errorText || response.statusText}`,
        );
      }

      const result = (await response.json()) as { secure_url?: string };
      if (!result.secure_url) {
        throw new BadRequestException('لم يتم استلام رابط الصورة من السحابة');
      }
      fileUrl = result.secure_url;
    } else {
      const base64 = Buffer.from(file.buffer).toString('base64');
      fileUrl = `data:${file.mimetype};base64,${base64}`;
    }

    course.coverImageUrl = fileUrl;
    await course.save();

    return {
      message: 'تم رفع وتحديث صورة غلاف المقرر بنجاح',
      courseId: course._id.toString(),
      courseCode: course.code,
      coverImageUrl: course.coverImageUrl,
    };
  }

  async getStudentSyllabi(
    studentUserId: string,
  ): Promise<StudentSyllabiResponse> {
    const studentUserObjId = new Types.ObjectId(studentUserId);
    const profile = await this.studentProfileModel
      .findOne({ userId: studentUserObjId })
      .lean();

    const latestRegistration = await this.courseRegistrationModel
      .findOne({
        studentId: studentUserObjId,
        status: 'approved',
      })
      .sort({ createdAt: -1 })
      .lean();

    const registeredCodes = (latestRegistration?.courses ?? []).map((c) =>
      c.toUpperCase(),
    );

    const studentLevel = profile?.level ?? '1';

    const [registeredCourses, levelCourses] = await Promise.all([
      registeredCodes.length > 0
        ? this.courseModel
            .find({
              code: { $in: registeredCodes },
              isActive: true,
            })
            .sort({ code: 1 })
            .lean()
        : [],
      this.courseModel
        .find({
          $or: [{ level: studentLevel }, { academicLevel: studentLevel }],
          isActive: true,
        })
        .sort({ code: 1 })
        .lean(),
    ]);

    return {
      studentLevel,
      registeredCount: registeredCourses.length,
      registeredCourses: registeredCourses.map((c) => ({
        ...c,
        isRegistered: true,
      })),
      availableLevelCourses: levelCourses.map((c) => ({
        ...c,
        isRegistered: registeredCodes.includes(c.code.toUpperCase()),
      })),
    };
  }

  async removeSyllabus(courseId: string): Promise<{ message: string }> {
    const course = await this.findOne(courseId);
    course.syllabusPdfUrl = undefined;
    course.syllabusPdfName = undefined;
    await course.save();
    return { message: 'تم إزالة ملف المنهج بنجاح' };
  }

  async removeCoverImage(courseId: string): Promise<{ message: string }> {
    const course = await this.findOne(courseId);
    course.coverImageUrl = undefined;
    await course.save();
    return { message: 'تم إزالة صورة غلاف المقرر بنجاح' };
  }

  /**
   * Generate downloadable Excel template for course student enrollment matching institute format.
   */
  async generateEnrollmentTemplate(
    format: 'xlsx' | 'csv' = 'xlsx',
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    if (format === 'csv') {
      const csvHeaders = [
        'كود الطالب',
        'الفرقة',
        'الحجب',
        'اسم الطالب (اختياري)',
      ];
      const sampleRows = [
        '260402,الفرقة الثانية,مفعل,عبدالرحمن صابر علي محمود وحيده',
        '260104,الفرقة الثانية,مفعل,فارس ابراهيم نصر ابراهيم عبدالوهاب المالح',
        '260464,الفرقة الثانية,محجوب,مصطفى ايهاب العوضي عريب محمد',
        '260791,الفرقة الثانية,مفعل,ملك محمد رضا عبدالسلام عثمان',
        '261556,الفرقة الثانية,محجوب,خلود نشأت رمضان عبدالعزيز علي',
        '260646,الفرقة الثانية,مفعل,مصطفى عصمت حسن صديق احمد',
      ];
      const csvContent =
        '\uFEFF' + [csvHeaders.join(','), ...sampleRows].join('\n');
      return {
        buffer: Buffer.from(csvContent, 'utf-8'),
        contentType: 'text/csv; charset=utf-8',
        filename: 'course-students-enrollment-template.csv',
      };
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BH47A Student Portal';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('تسجيل الطلاب بالمقرر', {
      views: [{ rightToLeft: true }],
    });

    sheet.columns = [
      { header: 'كود الطالب', key: 'student_code', width: 20 },
      { header: 'الفرقة', key: 'level', width: 22 },
      { header: 'الحجب', key: 'status', width: 18 },
      { header: 'اسم الطالب (اختياري)', key: 'student_name', width: 38 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.height = 30;
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
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Sample data rows matching institute format
    const sampleRows = [
      {
        student_code: '260402',
        level: 'الفرقة الثانية',
        status: 'مفعل',
        student_name: 'عبدالرحمن صابر علي محمود وحيده',
      },
      {
        student_code: '260104',
        level: 'الفرقة الثانية',
        status: 'مفعل',
        student_name: 'فارس ابراهيم نصر ابراهيم عبدالوهاب المالح',
      },
      {
        student_code: '260464',
        level: 'الفرقة الثانية',
        status: 'محجوب',
        student_name: 'مصطفى ايهاب العوضي عريب محمد',
      },
      {
        student_code: '260791',
        level: 'الفرقة الثانية',
        status: 'مفعل',
        student_name: 'ملك محمد رضا عبدالسلام عثمان',
      },
      {
        student_code: '261556',
        level: 'الفرقة الثانية',
        status: 'محجوب',
        student_name: 'خلود نشأت رمضان عبدالعزيز علي',
      },
      {
        student_code: '260646',
        level: 'الفرقة الثانية',
        status: 'مفعل',
        student_name: 'مصطفى عصمت حسن صديق احمد',
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
      filename: 'course-students-enrollment-template.xlsx',
    };
  }

  /**
   * Bulk enroll students into a single course from uploaded Excel sheet.
   */
  async enrollStudentsFromExcel(
    courseId: string,
    buffer: Buffer,
    originalname: string,
    options: {
      academicYear?: string;
      semester?: string;
      skipBlocked?: boolean;
    } = {},
  ): Promise<{
    courseId: string;
    courseCode: string;
    courseName: string;
    totalRows: number;
    enrolledCount: number;
    alreadyEnrolledCount: number;
    skippedBlockedCount: number;
    errorCount: number;
    errors: string[];
  }> {
    const course = await this.findOne(courseId);
    const rawRows = await this.parseEnrollmentWorkbookRows(
      buffer,
      originalname,
    );
    if (rawRows.length === 0) {
      throw new BadRequestException(
        'الملف فارغ أو لا يحتوي على صفوف بيانات صالحة',
      );
    }
    return this.processEnrollmentRows(course, rawRows, options);
  }

  /**
   * Bulk enroll students into a course from pre-parsed JSON row batches.
   */
  async enrollStudentsBatch(
    courseId: string,
    rawRows: Record<string, any>[],
    options: {
      academicYear?: string;
      semester?: string;
      skipBlocked?: boolean;
    } = {},
  ): Promise<{
    courseId: string;
    courseCode: string;
    courseName: string;
    totalRows: number;
    enrolledCount: number;
    alreadyEnrolledCount: number;
    skippedBlockedCount: number;
    errorCount: number;
    errors: string[];
  }> {
    const course = await this.findOne(courseId);
    if (!rawRows || rawRows.length === 0) {
      throw new BadRequestException('الدفعة فارغة أو لا تحتوي على صفوف صالحة');
    }
    return this.processEnrollmentRows(course, rawRows, options);
  }

  /**
   * High-performance batch enrollment engine using indexed lookups and bulkWrite.
   */
  async processEnrollmentRows(
    course: CourseDocument,
    rawRows: Record<string, any>[],
    options: {
      academicYear?: string;
      semester?: string;
      skipBlocked?: boolean;
    } = {},
  ): Promise<{
    courseId: string;
    courseCode: string;
    courseName: string;
    totalRows: number;
    enrolledCount: number;
    alreadyEnrolledCount: number;
    skippedBlockedCount: number;
    errorCount: number;
    errors: string[];
  }> {
    const academicYear = options.academicYear || '2026-2027';
    const semester =
      (options.semester as 'first' | 'second' | 'summer') || 'first';
    const skipBlocked = options.skipBlocked === true;

    // 1. Collect all candidate student codes from rows
    const codeCandidates = new Set<string>();
    for (const row of rawRows) {
      const code = this.extractFieldValue(row, [
        'كود الطالب',
        'كود_الطالب',
        'كود',
        'student_code',
        'studentcode',
        'code',
      ]);
      if (code && code.trim()) {
        const clean = code.trim();
        codeCandidates.add(clean);
        codeCandidates.add(clean.toLowerCase());
        codeCandidates.add(clean.toUpperCase());
      }
    }

    const candidateArray = Array.from(codeCandidates);

    // 2. Preload ONLY the matching student profiles and users
    const [matchingProfiles, matchingStudentUsers] = await Promise.all([
      candidateArray.length > 0
        ? await this.studentProfileModel
            .find({ studentCode: { $in: candidateArray } })
            .lean()
        : [],
      candidateArray.length > 0
        ? await this.userModel
            .find({
              role: 'student',
              $or: [
                { code: { $in: candidateArray } },
                { username: { $in: candidateArray } },
              ],
            })
            .lean()
        : [],
    ]);

    const profileByCode = new Map<string, any>();
    matchingProfiles.forEach((p: any) => {
      if (p.studentCode) {
        profileByCode.set(String(p.studentCode).trim().toLowerCase(), p);
      }
    });

    const userByCode = new Map<string, any>();
    matchingStudentUsers.forEach((u: any) => {
      if (u.code) {
        userByCode.set(String(u.code).trim().toLowerCase(), u);
      }
      if (u.username) {
        userByCode.set(String(u.username).trim().toLowerCase(), u);
      }
    });

    // 3. Collect target student user IDs for batch registration query
    const targetStudentUserIds: Types.ObjectId[] = [];
    for (const row of rawRows) {
      const rawCode = this.extractFieldValue(row, [
        'كود الطالب',
        'كود_الطالب',
        'كود',
        'student_code',
        'studentcode',
        'code',
      ]);
      if (!rawCode) continue;
      const cleanCode = rawCode.trim().toLowerCase();
      const profile = profileByCode.get(cleanCode);
      const studentUser = userByCode.get(cleanCode);
      const studentUserId = profile?.userId || studentUser?._id;
      if (studentUserId) {
        targetStudentUserIds.push(new Types.ObjectId(studentUserId));
      }
    }

    // 4. Single batch query for existing registrations
    const existingRegistrations =
      targetStudentUserIds.length > 0
        ? await this.courseRegistrationModel
            .find({
              studentId: { $in: targetStudentUserIds },
              academicYear,
              semester,
            })
            .lean()
        : [];

    const regByStudentId = new Map<string, any>();
    existingRegistrations.forEach((reg) => {
      regByStudentId.set(reg.studentId.toString(), reg);
    });

    let enrolledCount = 0;
    let alreadyEnrolledCount = 0;
    let skippedBlockedCount = 0;
    const errors: string[] = [];

    const courseCodeUpper = course.code.toUpperCase();
    const courseCreditHours = course.creditHours || 3;

    const profileBulkOps: any[] = [];
    const registrationBulkOps: any[] = [];
    const processedStudentIds = new Set<string>();

    for (let index = 0; index < rawRows.length; index++) {
      const row = rawRows[index];
      const rowNum = index + 2;

      const rawCode = this.extractFieldValue(row, [
        'كود الطالب',
        'كود_الطالب',
        'كود',
        'student_code',
        'studentcode',
        'code',
      ]);

      const rawLevel = this.extractFieldValue(row, [
        'الفرقة',
        'فرقة',
        'level',
        'السنة',
        'الصف',
      ]);

      const rawBlock = this.extractFieldValue(row, [
        'الحجب',
        'حجب',
        'الحالة',
        'status',
        'block',
        'حالة المصروفات',
        'المصروفات',
      ]);

      const rawName = this.extractFieldValue(row, [
        'اسم الطالب',
        'اسم_الطالب',
        'الاسم',
        'student_name',
        'name',
      ]);

      if (!rawCode) {
        errors.push(`السطر ${rowNum}: لم يتم العثور على كود الطالب في الصف`);
        continue;
      }

      const cleanCode = rawCode.trim().toLowerCase();
      const profile = profileByCode.get(cleanCode);
      const studentUser = userByCode.get(cleanCode);

      const studentUserId = profile?.userId || studentUser?._id;

      if (!studentUserId) {
        errors.push(
          `السطر ${rowNum}: لم يتم العثور على طالب مسجل بالكود "${rawCode}" (${rawName || ''})`,
        );
        continue;
      }

      const studentUserIdStr = studentUserId.toString();
      if (processedStudentIds.has(studentUserIdStr)) {
        continue;
      }
      processedStudentIds.add(studentUserIdStr);

      // Sync level & block/tuition status if profile exists
      let isStudentBlocked = profile?.isBlocked || false;
      const profileUpdates: Record<string, any> = {};

      if (rawBlock) {
        const isMarkedBlocked =
          rawBlock.includes('محجوب') ||
          rawBlock.toLowerCase() === 'blocked' ||
          rawBlock.toLowerCase() === 'unpaid';
        const isMarkedActive =
          rawBlock.includes('مفعل') ||
          rawBlock.toLowerCase() === 'active' ||
          rawBlock.toLowerCase() === 'paid';

        if (isMarkedBlocked) {
          isStudentBlocked = true;
          profileUpdates.isBlocked = true;
          profileUpdates.tuitionFeesStatus = 'unpaid';
          profileUpdates.blockReason = 'عدم سداد المصروفات الدراسية';
          profileUpdates.blockedAt = new Date();
        } else if (isMarkedActive) {
          isStudentBlocked = false;
          profileUpdates.isBlocked = false;
          profileUpdates.tuitionFeesStatus = 'paid';
          profileUpdates.unblockedAt = new Date();
        }
      }

      if (rawLevel) {
        let normalizedLevel: string | undefined;
        if (
          rawLevel.includes('أولى') ||
          rawLevel.includes('اولى') ||
          rawLevel === '1'
        ) {
          normalizedLevel = '1';
        } else if (
          rawLevel.includes('ثاني') ||
          rawLevel.includes('ثانيه') ||
          rawLevel === '2'
        ) {
          normalizedLevel = '2';
        } else if (
          rawLevel.includes('ثالث') ||
          rawLevel.includes('ثالثه') ||
          rawLevel === '3'
        ) {
          normalizedLevel = '3';
        } else if (
          rawLevel.includes('رابع') ||
          rawLevel.includes('رابعه') ||
          rawLevel === '4'
        ) {
          normalizedLevel = '4';
        } else if (['1', '2', '3', '4'].includes(rawLevel.trim())) {
          normalizedLevel = rawLevel.trim();
        }

        if (normalizedLevel && profile?.level !== normalizedLevel) {
          profileUpdates.level = normalizedLevel;
        }
      }

      if (profile?._id && Object.keys(profileUpdates).length > 0) {
        profileBulkOps.push({
          updateOne: {
            filter: { _id: profile._id },
            update: { $set: profileUpdates },
          },
        });
      }

      // Check blocked status if skipBlocked enabled
      if (skipBlocked && isStudentBlocked) {
        skippedBlockedCount++;
        continue;
      }

      const studentUserObjId = new Types.ObjectId(studentUserId);
      const existingReg = regByStudentId.get(studentUserIdStr);

      if (existingReg) {
        const existingCourses = (existingReg.courses || []).map((c: string) =>
          c.toUpperCase(),
        );

        if (existingCourses.includes(courseCodeUpper)) {
          alreadyEnrolledCount++;
        } else {
          registrationBulkOps.push({
            updateOne: {
              filter: { _id: existingReg._id },
              update: {
                $addToSet: { courses: courseCodeUpper },
                $set: { status: 'approved', approvedAt: new Date() },
                $inc: { totalCreditHours: courseCreditHours },
              },
            },
          });
          enrolledCount++;
        }
      } else {
        registrationBulkOps.push({
          insertOne: {
            document: {
              studentId: studentUserObjId,
              courses: [courseCodeUpper],
              academicYear,
              semester,
              totalCreditHours: courseCreditHours,
              source: 'system',
              status: 'approved',
              approvedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        });
        enrolledCount++;
      }
    }

    // 5. Execute bulk writes in parallel
    const dbPromises: Promise<any>[] = [];
    if (profileBulkOps.length > 0) {
      dbPromises.push(
        this.studentProfileModel.bulkWrite(profileBulkOps, { ordered: false }),
      );
    }
    if (registrationBulkOps.length > 0) {
      dbPromises.push(
        this.courseRegistrationModel.bulkWrite(registrationBulkOps, {
          ordered: false,
        }),
      );
    }
    if (dbPromises.length > 0) {
      await Promise.all(dbPromises);
    }

    return {
      courseId: course._id.toString(),
      courseCode: course.code,
      courseName: course.name,
      totalRows: rawRows.length,
      enrolledCount,
      alreadyEnrolledCount,
      skippedBlockedCount,
      errorCount: errors.length,
      errors: errors.slice(0, 20),
    };
  }

  private cleanFieldValue(val: any): string {
    if (val === null || val === undefined) return '';
    return String(val).trim();
  }

  private extractFieldValue(
    row: Record<string, any>,
    possibleKeys: string[],
  ): string {
    for (const key of possibleKeys) {
      const cleanKey = key.toLowerCase().replace(/[\s_\-()]/g, '');
      for (const [rowKey, rowValue] of Object.entries(row)) {
        const cleanRowKey = rowKey.toLowerCase().replace(/[\s_\-()]/g, '');
        if (cleanRowKey === cleanKey || cleanRowKey.includes(cleanKey)) {
          if (rowValue !== undefined && rowValue !== null) {
            return this.cleanFieldValue(rowValue);
          }
        }
      }
    }
    return '';
  }

  private async parseEnrollmentWorkbookRows(
    buffer: Buffer,
    originalname: string,
  ): Promise<Record<string, any>[]> {
    const isCsv = originalname.toLowerCase().endsWith('.csv');

    if (isCsv) {
      const text = buffer.toString('utf-8');
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length <= 1) return [];

      const headers = lines[0].split(/[,;\t]/).map((h) =>
        this.cleanFieldValue(h)
          .replace(/^["']|["']$/g, '')
          .toLowerCase(),
      );

      const rows: Record<string, any>[] = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i]
          .split(/[,;\t]/)
          .map((p) => this.cleanFieldValue(p).replace(/^["']|["']$/g, ''));
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
          this.cleanFieldValue(v).toLowerCase(),
        );
        return;
      }

      const values = row.values as any[];
      if (!Array.isArray(values)) return;

      const rowData: Record<string, any> = {};
      let hasData = false;
      headers.forEach((h, idx) => {
        if (!h) return;
        const cell = values[idx + 1];
        if (cell !== undefined && cell !== null && String(cell).trim() !== '') {
          hasData = true;
          rowData[h] = typeof cell === 'object' && cell.text ? cell.text : cell;
        }
      });

      if (hasData) {
        rows.push(rowData);
      }
    });

    return rows;
  }
}
