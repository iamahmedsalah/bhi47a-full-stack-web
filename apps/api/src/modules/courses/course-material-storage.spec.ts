import { Types } from 'mongoose';
import { CoursesService } from './courses.service';
import { PERMISSIONS } from '@student-portal/shared';
import type {
  MaterialStorageService,
  MaterialUpload,
} from '../material-storage/material-storage.service';

describe('course materials storage boundaries', () => {
  const doctor = {
    _id: new Types.ObjectId(),
    role: 'staff',
    staffType: 'doctor',
    permissions: [
      PERMISSIONS.COURSES_WRITE,
      PERMISSIONS.COURSE_MATERIALS_WRITE,
      PERMISSIONS.COURSE_MATERIALS_DELETE,
    ],
  };
  const ta = {
    _id: new Types.ObjectId(),
    role: 'staff',
    staffType: 'teaching_assistant',
  };
  const admin = { _id: new Types.ObjectId(), role: 'admin' };
  const stored = {
    storageProvider: 'vps',
    storageKey: `files/${crypto.randomUUID()}`,
    originalName: 'book.pdf',
    size: 20,
    mimeType: 'application/pdf',
    sha256: 'abc',
  };
  const file: MaterialUpload = {
    path: '/private/.tmp/upload',
    originalname: 'book.pdf',
    mimetype: 'application/pdf',
    size: 20,
  };
  let service: CoursesService;
  let course: any;
  let materials: any;
  let storage: any;
  let students: any;
  let courseExists: jest.Mock;
  beforeEach(() => {
    course = {
      _id: new Types.ObjectId(),
      doctorId: doctor._id,
      teachingAssistantIds: [ta._id],
      syllabusPdfUrl: 'https://old.example/book.pdf',
      syllabusUploadedBy: doctor._id,
      get: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    materials = jest.fn().mockImplementation((data) => ({
      ...data,
      _id: new Types.ObjectId(),
      save: jest.fn().mockResolvedValue(data),
    }));
    materials.findById = jest.fn();
    materials.find = jest.fn().mockReturnValue({
      sort: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    });
    materials.findOneAndDelete = jest.fn().mockResolvedValue({});
    materials.exists = jest.fn().mockResolvedValue(null);
    students = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ isBlocked: false }),
      }),
    };
    storage = {
      save: jest.fn().mockResolvedValue(stored),
      deliver: jest.fn(),
      removeUncommitted: jest.fn(),
    };
    courseExists = jest.fn().mockResolvedValue(null);
    service = new CoursesService(
      {
        findById: jest.fn(() =>
          Object.assign(Promise.resolve(course), {
            select: jest.fn().mockResolvedValue(course),
          }),
        ),
        exists: courseExists,
      } as never,
      materials,
      {} as never,
      students,
      {} as never,
      { get: jest.fn() } as never,
      undefined,
      undefined,
      undefined,
      storage as MaterialStorageService,
    );
  });

  it.each([
    ['lecture', doctor],
    ['section', ta],
  ] as const)(
    'saves a %s recording without storing file bytes',
    async (type, caller) => {
      const videoUrl = 'https://drive.google.com/file/d/recording/view';
      const result = await service.uploadCourseMaterial(
        course._id.toString(),
        undefined,
        {
          type,
          title: 'Recorded class',
          videoUrl,
        },
        caller,
      );
      expect(result.material).toMatchObject({
        videoUrl,
        type,
        uploadedByRole: caller.staffType,
      });
      expect(storage.save).not.toHaveBeenCalled();
    },
  );

  it('rejects missing content and unsafe URLs, including URLs attached to files', async () => {
    for (const [upload, videoUrl] of [
      [undefined, undefined],
      [file, 'javascript:alert(1)'],
      [undefined, 'javascript:alert(1)'],
      [undefined, 'https://user:password@example.com/video'],
    ] as const) {
      await expect(
        service.uploadCourseMaterial(
          course._id.toString(),
          upload,
          {
            type: 'lecture',
            title: 'Recording',
            videoUrl,
          },
          doctor,
        ),
      ).rejects.toThrow();
    }
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('stores a PDF and optional recording together and allows downloading the PDF', async () => {
    const videoUrl = 'https://example.com/video';
    const result = await service.uploadCourseMaterial(
      course._id.toString(),
      file,
      { type: 'lecture', title: 'Lecture with recording', videoUrl },
      doctor,
    );
    expect(result.material).toMatchObject({ storedFile: stored, videoUrl });
    expect(storage.save).toHaveBeenCalledWith(file, false);
    materials.findById.mockResolvedValue(result.material);
    await service.downloadCourseMaterial('id', {}, admin);
    expect(storage.deliver).toHaveBeenCalledWith(stored, {});
  });

  it.each(['teaching_assistant', 'assistant_lecturer'])(
    'applies the assigned %s material rules for preflight, listing and upload',
    async (staffType) => {
      const caller = {
        ...ta,
        staffType,
        permissions: [PERMISSIONS.COURSE_MATERIALS_WRITE],
      };
      // Legacy embedded assignments must work at both authorization boundaries.
      course.teachingAssistantIds = [];
      course.teachingAssistants = [{ _id: ta._id.toString() }];
      await expect(
        service.authorizeMaterialUpload(course._id.toString(), caller, false),
      ).resolves.toBeUndefined();
      const result = await service.uploadCourseMaterial(
        course._id.toString(),
        file,
        {
          type: 'section',
          title: 'Section',
          videoUrl: 'https://example.com/video',
        },
        caller,
      );
      expect(result.material.uploadedByRole).toBe(staffType);
      const lecture = service.uploadCourseMaterial(
        course._id.toString(),
        file,
        { type: 'lecture', title: 'Lecture' },
        caller,
      );
      await expect(lecture).rejects.toThrow();
      await expect(
        service.getCourseMaterials(course._id.toString(), {}, caller),
      ).resolves.toMatchObject({ allowedUploadTypes: ['section'] });
      await expect(
        service.getCourseMaterials(
          course._id.toString(),
          {},
          { ...caller, permissions: [] },
        ),
      ).resolves.toMatchObject({ allowedUploadTypes: [] });
      await expect(
        service.getCourseMaterials(
          course._id.toString(),
          {},
          { ...caller, _id: new Types.ObjectId() },
        ),
      ).rejects.toThrow();
      await expect(
        service.authorizeMaterialUpload(
          course._id.toString(),
          { ...caller, _id: new Types.ObjectId() },
          false,
        ),
      ).rejects.toThrow();
      await expect(
        service.uploadCourseMaterial(
          course._id.toString(),
          file,
          { type: 'section', title: 'Section' },
          { ...caller, _id: new Types.ObjectId() },
        ),
      ).rejects.toThrow();
    },
  );

  it('allows an assistant_lecturer assigned in doctorIds/doctors (stale bucket) to pass preflight and upload a section', async () => {
    const assistantLecturer = {
      _id: new Types.ObjectId(),
      role: 'staff',
      staffType: 'assistant_lecturer',
    };
    course.doctorIds = [assistantLecturer._id];
    course.teachingAssistantIds = [];
    course.teachingAssistants = [];
    await expect(
      service.authorizeMaterialUpload(
        course._id.toString(),
        assistantLecturer,
        false,
      ),
    ).resolves.toBeUndefined();
    const result = await service.uploadCourseMaterial(
      course._id.toString(),
      file,
      { type: 'section', title: 'Section from assistant lecturer' },
      assistantLecturer,
    );
    expect(result.material.uploadedByRole).toBe('assistant_lecturer');
    expect(result.material.type).toBe('section');
    await expect(
      service.uploadCourseMaterial(
        course._id.toString(),
        file,
        { type: 'lecture', title: 'Lecture from assistant lecturer' },
        assistantLecturer,
      ),
    ).rejects.toThrow();
  });

  it('preserves assignment and type permissions for recording links', async () => {
    for (const caller of [
      ta,
      { ...doctor, _id: new Types.ObjectId() },
      { ...doctor, role: 'student' },
    ]) {
      await expect(
        service.uploadCourseMaterial(
          course._id.toString(),
          undefined,
          {
            type: 'lecture',
            title: 'Recording',
            videoUrl: 'https://example.com/video',
          },
          caller,
        ),
      ).rejects.toThrow();
    }
  });

  it('does not stream an external recording through file storage', async () => {
    materials.findById.mockResolvedValue({
      isPublished: true,
      videoUrl: 'https://example.com/video',
    });
    await expect(
      service.downloadCourseMaterial('id', {}, admin),
    ).rejects.toThrow('recording link');
    expect(storage.deliver).not.toHaveBeenCalled();
  });

  it('stores book metadata without file bytes', async () => {
    await service.uploadSyllabus(course._id.toString(), file, doctor);
    expect(course.syllabusFile).toEqual(stored);
    expect(course.syllabusPdfData).toBeUndefined();
    expect(course.syllabusPdfUrl).toContain('/syllabus/download');
    expect(String(course.syllabusUploadedBy)).toBe(String(doctor._id));
    expect(storage.removeUncommitted).not.toHaveBeenCalled();
  });

  it('preserves the book owner during supervision and denies another assigned doctor', async () => {
    const colleague = { ...doctor, _id: new Types.ObjectId() };
    course.doctorIds = [doctor._id, colleague._id];
    await expect(
      service.uploadSyllabus(String(course._id), file, colleague),
    ).rejects.toThrow();
    expect(storage.save).not.toHaveBeenCalled();
    course.contentSupervisorId = colleague._id;
    await service.uploadSyllabus(String(course._id), file, colleague);
    expect(String(course.syllabusUploadedBy)).toBe(String(doctor._id));
    course.contentSupervisorId = undefined;
    await expect(
      service.uploadSyllabus(String(course._id), file, colleague),
    ).rejects.toThrow();
  });

  it('allows an administrator to replace a legacy book with no known owner', async () => {
    course.syllabusUploadedBy = undefined;
    await expect(
      service.uploadSyllabus(String(course._id), file, doctor),
    ).rejects.toThrow();
    await service.uploadSyllabus(String(course._id), file, admin);
    expect(String(course.syllabusUploadedBy)).toBe(String(admin._id));
  });

  it('cleans the new book after a failed metadata write, preserving old disk files', async () => {
    course.save.mockRejectedValue(
      Object.assign(new Error('Database unavailable'), {
        name: 'ValidationError',
      }),
    );
    await expect(
      service.uploadSyllabus(course._id.toString(), file, doctor),
    ).rejects.toThrow('Database unavailable');
    expect(storage.removeUncommitted).toHaveBeenCalledWith(stored);
    expect(storage.removeUncommitted).toHaveBeenCalledTimes(1);
  });

  it.each(['committed', 'unavailable'])(
    'retains the file when a failed acknowledgement is %s',
    async (outcome) => {
      course.save.mockRejectedValue(new Error('Acknowledgement lost'));
      if (outcome === 'committed')
        courseExists.mockResolvedValue({ _id: course._id });
      else courseExists.mockRejectedValue(new Error('Database unavailable'));
      await expect(
        service.uploadSyllabus(course._id.toString(), file, doctor),
      ).rejects.toThrow('Acknowledgement lost');
      expect(storage.removeUncommitted).not.toHaveBeenCalled();
    },
  );

  it('rejects TAs and unassigned doctors before saving book bytes', async () => {
    await expect(
      service.uploadSyllabus(course._id.toString(), file, ta),
    ).rejects.toThrow();
    await expect(
      service.authorizeMaterialUpload(
        course._id.toString(),
        { ...doctor, _id: new Types.ObjectId() },
        true,
      ),
    ).rejects.toThrow();
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('keeps doctors on lectures and TAs on sections', async () => {
    await expect(
      service.uploadCourseMaterial(
        course._id.toString(),
        file,
        { type: 'section', title: 'Section' },
        doctor,
      ),
    ).rejects.toThrow();
    await expect(
      service.uploadCourseMaterial(
        course._id.toString(),
        file,
        { type: 'lecture', title: 'Lecture' },
        ta,
      ),
    ).rejects.toThrow();
    expect(storage.save).not.toHaveBeenCalled();
    await service.uploadCourseMaterial(
      course._id.toString(),
      file,
      { type: 'section', title: 'Section' },
      ta,
    );
    expect(storage.save).toHaveBeenCalledWith(file, false);
  });

  it('blocks unpublished student downloads, including direct IDs', async () => {
    materials.findById.mockResolvedValue({
      isPublished: false,
      storedFile: stored,
    });
    await expect(
      service.downloadCourseMaterial(
        'id',
        {},
        { _id: 'student', role: 'student' },
      ),
    ).rejects.toThrow('unavailable');
    expect(storage.deliver).not.toHaveBeenCalled();
    await service.downloadCourseMaterial('id', {}, admin);
    expect(storage.deliver).toHaveBeenCalledWith(stored, {});
  });

  it('blocks unpaid students before file delivery', async () => {
    materials.findById.mockResolvedValue({
      isPublished: true,
      storedFile: stored,
    });
    students.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ isBlocked: true }),
    });
    await expect(
      service.downloadCourseMaterial(
        'id',
        {},
        { _id: 'student', role: 'student' },
      ),
    ).rejects.toThrow();
    expect(storage.deliver).not.toHaveBeenCalled();
  });

  it('prevents another uploader from deleting a material and retains bytes for backups', async () => {
    const materialId = new Types.ObjectId();
    materials.findById.mockResolvedValue({
      _id: materialId,
      uploadedBy: doctor._id,
      courseId: course._id,
      type: 'lecture',
      storedFile: stored,
      get: jest.fn(),
    });
    await expect(
      service.deleteCourseMaterial(String(materialId), {
        ...ta,
        permissions: [PERMISSIONS.COURSE_MATERIALS_DELETE],
      }),
    ).rejects.toThrow();
    expect(materials.findOneAndDelete).not.toHaveBeenCalled();
    await service.deleteCourseMaterial(String(materialId), doctor);
    expect(materials.findOneAndDelete).toHaveBeenCalledWith({
      _id: materialId,
      updatedAt: null,
    });
    expect(storage.removeUncommitted).not.toHaveBeenCalled();
  });

  it('updates material attachments and metadata while preserving its uploader', async () => {
    const material = {
      _id: new Types.ObjectId(),
      courseId: course._id,
      uploadedBy: doctor._id,
      title: 'Original lecture',
      type: 'lecture',
      storedFile: { ...stored, storageKey: 'files/original' },
      weekNumber: 4,
      get: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    materials.findById.mockResolvedValue(material);
    await expect(
      service.updateCourseMaterial(
        String(material._id),
        [file],
        { title: 'Updated lecture', weekNumber: null },
        {
          ...ta,
          permissions: [PERMISSIONS.COURSE_MATERIALS_WRITE],
        },
      ),
    ).rejects.toThrow();
    expect(storage.save).not.toHaveBeenCalled();
    await service.updateCourseMaterial(
      String(material._id),
      [file],
      { title: 'Updated lecture', weekNumber: null },
      doctor,
    );
    expect(material).toMatchObject({
      title: 'Updated lecture',
      uploadedBy: doctor._id,
      storedFile: stored,
    });
    expect(material.weekNumber).toBeUndefined();
  });

  it('enforces student withholding and publication gates on material preview and supports inline delivery', async () => {
    materials.findById.mockResolvedValue({
      _id: new Types.ObjectId(),
      courseId: course._id,
      title: 'Lecture PDF',
      fileName: 'lecture.pdf',
      mimeType: 'application/pdf',
      fileSize: 2048,
      isPublished: true,
      storedFile: stored,
    });

    // Unblocked student receives fast zero-buffer PDF preview metadata
    const pdfPreview = await service.previewCourseMaterial('id', {
      _id: 'student',
      role: 'student',
    });
    expect(pdfPreview).toMatchObject({
      kind: 'pdf',
      fileName: 'book.pdf',
      mimeType: 'application/pdf',
    });

    // Inline delivery passes inline=true to MaterialStorageService
    await service.downloadCourseMaterial('id', {}, admin, { inline: true });
    expect(storage.deliver).toHaveBeenCalledWith(stored, {}, true);

    // Blocked student is rejected from previewing
    students.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ isBlocked: true }),
    });
    await expect(
      service.previewCourseMaterial('id', { _id: 'student', role: 'student' }),
    ).rejects.toThrow();
  });

  it('hydrates Arabic uploader names and flags missing physical files on list, preview, and book capabilities', async () => {
    const uploaderId = new Types.ObjectId();
    storage.exists = jest.fn().mockResolvedValue(false);
    (service as any).userModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: uploaderId,
              name: 'Omar Elsayed',
              nameAr: 'عمر السيد',
              titlePrefix: undefined,
            },
          ]),
        }),
      }),
    };
    materials.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: new Types.ObjectId(),
            courseId: course._id,
            title: 'Inheritance Part 2',
            titleAr: 'سكشن الوراثة الجزء الثاني',
            type: 'section',
            fileName: 'section9.pptx',
            mimeType:
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            fileSize: 56400,
            isPublished: true,
            uploadedBy: uploaderId,
            uploadedByName: 'Omar Elsayed',
            uploadedByRole: 'assistant_lecturer',
            storedFile: stored,
          },
        ]),
      }),
    });

    const listed = await service.getCourseMaterials(
      course._id.toString(),
      {},
      admin,
    );
    expect(listed.materials[0]).toMatchObject({
      uploadedByName: 'Omar Elsayed',
      uploadedByNameAr: 'عمر السيد',
      hasFile: true,
      fileAvailable: false,
    });

    materials.findById.mockResolvedValue({
      _id: new Types.ObjectId(),
      courseId: course._id,
      title: 'Missing PDF',
      fileName: 'lecture.pdf',
      mimeType: 'application/pdf',
      isPublished: true,
      storedFile: stored,
    });
    await expect(service.previewCourseMaterial('id', admin)).rejects.toThrow(
      'Material file is missing',
    );

    course.syllabusFile = stored;
    const caps = await service.getBookCapabilities(
      course._id.toString(),
      admin as never,
    );
    expect(caps.bookFileAvailable).toBe(false);
  });
});
