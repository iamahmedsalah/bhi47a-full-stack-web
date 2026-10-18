import { Types } from 'mongoose';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CoursesService } from './courses.service';

describe('CoursesService Unit Tests', () => {
  let service: CoursesService;

  const mockCourseModel: any = jest.fn();
  const mockCourseRegistrationModel: any = {};
  const mockStudentProfileModel: any = {};
  const mockUserModel: any = {};
  const mockConfigService: any = {
    get: jest.fn().mockReturnValue('http://localhost:4000'),
  };

  const doctorId = new Types.ObjectId().toString();
  const studentUserId = new Types.ObjectId().toString();
  const courseId = new Types.ObjectId().toString();

  beforeEach(() => {
    jest.clearAllMocks();

    mockCourseModel.findOne = jest.fn();
    mockCourseModel.find = jest.fn();
    mockCourseModel.findById = jest.fn();
    mockCourseModel.countDocuments = jest.fn();
    mockCourseRegistrationModel.findOne = jest.fn();
    mockCourseRegistrationModel.find = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });
    mockStudentProfileModel.findOne = jest.fn();
    mockUserModel.findById = jest.fn();

    service = new CoursesService(
      mockCourseModel,
      mockCourseRegistrationModel,
      mockStudentProfileModel,
      mockUserModel,
      mockConfigService,
    );
  });

  describe('create()', () => {
    it('throws ConflictException if course code already exists', async () => {
      mockCourseModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
        code: 'CS101',
      });

      await expect(
        service.create({
          code: 'CS101',
          name: 'Computer Science',
          level: '1',
          semester: 'first',
          creditHours: 3,
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('creates course and assigns doctor metadata if doctorId is provided', async () => {
      mockCourseModel.findOne.mockResolvedValue(null);
      mockUserModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(doctorId),
          name: 'Dr. Youssef',
          nameAr: 'د. يوسف',
        }),
      });

      const savedCourse = {
        _id: new Types.ObjectId(),
        code: 'CS101',
        doctorName: 'Dr. Youssef',
        doctorNameAr: 'د. يوسف',
      };

      function MockCourseInstance(this: any, data: any) {
        Object.assign(this, data);
        this.save = jest.fn().mockResolvedValue(savedCourse);
      }
      mockCourseModel.mockImplementation(MockCourseInstance);

      const result = await service.create({
        code: 'cs101',
        name: 'Computer Science',
        level: '1',
        semester: 'first',
        creditHours: 3,
        doctorId,
      } as any);

      expect(result).toBe(savedCourse);
    });
  });

  describe('findDoctorCourses()', () => {
    it('returns active courses assigned to the specified doctor ID', async () => {
      const doctorObjectId = new Types.ObjectId(doctorId);
      const assignedCourses = [
        {
          _id: new Types.ObjectId(),
          code: 'CS101',
          doctorId: doctorObjectId,
          isActive: true,
        },
        {
          _id: new Types.ObjectId(),
          code: 'CS102',
          doctorId: doctorObjectId,
          isActive: true,
        },
      ];

      mockCourseModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(assignedCourses),
      });
      mockCourseRegistrationModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest
            .fn()
            .mockResolvedValue([{ courses: ['CS101'], status: 'approved' }]),
        }),
      });

      const result = await service.findDoctorCourses(doctorId);
      expect(result).toEqual([
        { ...assignedCourses[0], enrolledStudentsCount: 1 },
        { ...assignedCourses[1], enrolledStudentsCount: 0 },
      ]);
      expect(mockCourseModel.find).toHaveBeenCalledWith({
        doctorId: doctorObjectId,
        isActive: true,
      });
    });
  });

  describe('getStudentSyllabi()', () => {
    it('returns student registered course syllabi and available level syllabi', async () => {
      mockStudentProfileModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ level: '2' }),
      });

      mockCourseRegistrationModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            courses: ['CS101'],
            status: 'approved',
          }),
        }),
      });

      const registeredCourse = {
        _id: new Types.ObjectId(),
        code: 'CS101',
        name: 'CS 101',
        syllabusPdfUrl: 'http://cdn/cs101.pdf',
      };

      const levelCourse = {
        _id: new Types.ObjectId(),
        code: 'CS201',
        name: 'CS 201',
        syllabusPdfUrl: 'http://cdn/cs201.pdf',
      };

      mockCourseModel.find
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([registeredCourse]),
          }),
        })
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([levelCourse]),
          }),
        });

      const result = await service.getStudentSyllabi(studentUserId);

      expect(result.studentLevel).toBe('2');
      expect(result.registeredCount).toBe(1);
      expect(result.registeredCourses[0].code).toBe('CS101');
      expect(result.registeredCourses[0].isRegistered).toBe(true);
      expect(result.availableLevelCourses[0].code).toBe('CS201');
    });
  });

  describe('findOne()', () => {
    it('throws NotFoundException if course is not found', async () => {
      mockCourseModel.findById.mockResolvedValue(null);

      await expect(service.findOne(courseId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
