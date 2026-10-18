import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
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
    return course.save();
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

  async downloadSyllabus(courseId: string, res: any) {
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
}
