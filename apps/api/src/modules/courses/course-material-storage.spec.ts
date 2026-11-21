import { Types } from 'mongoose';
import { CoursesService } from './courses.service';
import type {
  MaterialStorageService,
  MaterialUpload,
} from '../material-storage/material-storage.service';

describe('course materials storage boundaries', () => {
  const doctor = {
    _id: new Types.ObjectId(),
    role: 'staff',
    staffType: 'doctor',
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
      save: jest.fn().mockResolvedValue(undefined),
    };
    materials = jest.fn().mockImplementation((data) => ({
      ...data,
      _id: new Types.ObjectId(),
      save: jest.fn().mockResolvedValue(data),
    }));
    materials.findById = jest.fn();
    materials.findByIdAndDelete = jest.fn();
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
        findById: jest.fn().mockResolvedValue(course),
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
    'allows an assigned %s through preflight and section upload, but rejects lectures and unassigned courses',
    async (staffType) => {
      const caller = { ...ta, staffType };
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
      await expect(
        service.uploadCourseMaterial(
          course._id.toString(),
          file,
          { type: 'lecture', title: 'Lecture' },
          caller,
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
    expect(storage.removeUncommitted).not.toHaveBeenCalled();
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
    materials.findById.mockResolvedValue({
      uploadedBy: doctor._id,
      courseId: course._id,
      type: 'lecture',
      storedFile: stored,
    });
    await expect(service.deleteCourseMaterial('id', ta)).rejects.toThrow();
    expect(materials.findByIdAndDelete).not.toHaveBeenCalled();
    await service.deleteCourseMaterial('id', doctor);
    expect(materials.findByIdAndDelete).toHaveBeenCalledWith('id');
    expect(storage.removeUncommitted).not.toHaveBeenCalled();
  });
});
