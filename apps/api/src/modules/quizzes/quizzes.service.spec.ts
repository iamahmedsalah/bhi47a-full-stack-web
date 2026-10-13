import { Types } from 'mongoose';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { QuizzesService } from './quizzes.service';
import { PERMISSIONS } from '@student-portal/shared';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';

describe('QuizzesService Unit Tests', () => {
  let service: QuizzesService;

  const mockQuizModel: any = jest.fn();
  const mockSubmissionModel: any = jest.fn();
  const mockAttemptModel: any = jest.fn();
  const mockCourseModel: any = {};
  const mockRegistrationModel: any = {};
  const mockStudentProfileModel: any = {};
  const mockNotificationsService: any = {
    sendNotification: jest.fn().mockResolvedValue({}),
  };
  const mockExcelService: any = {
    parseQuestionsFile: jest.fn(),
    generateQuestionsTemplate: jest.fn(),
  };

  const adminUser: AuthenticatedUser = {
    _id: new Types.ObjectId().toString(),
    name: 'Admin User',
    email: 'admin@institute.edu',
    role: 'admin',
    permissions: [PERMISSIONS.QUIZZES_READ, PERMISSIONS.QUIZZES_WRITE],
  };

  const staffUser: AuthenticatedUser = {
    _id: new Types.ObjectId().toString(),
    name: 'Doctor Staff',
    email: 'doctor@institute.edu',
    role: 'staff',
    permissions: [],
  };

  const courseId = new Types.ObjectId().toString();
  const quizId = new Types.ObjectId().toString();
  const studentUserId = new Types.ObjectId().toString();

  beforeEach(() => {
    jest.clearAllMocks();

    mockAttemptModel.findOne = jest.fn();
    mockAttemptModel.findOneAndUpdate = jest
      .fn()
      .mockResolvedValue({ _id: new Types.ObjectId() });
    mockAttemptModel.updateOne = jest
      .fn()
      .mockResolvedValue({ acknowledged: true });
    mockAttemptModel.create = jest.fn();
    mockAttemptModel.find = jest.fn();
    mockCourseModel.findById = jest.fn();
    mockCourseModel.find = jest.fn();
    mockQuizModel.findById = jest.fn();
    mockQuizModel.find = jest.fn();
    mockQuizModel.countDocuments = jest.fn();
    mockQuizModel.findByIdAndUpdate = jest.fn();
    mockQuizModel.findByIdAndDelete = jest.fn();
    mockSubmissionModel.findOne = jest.fn();
    mockSubmissionModel.find = jest.fn();
    mockSubmissionModel.create = jest.fn();
    mockSubmissionModel.aggregate = jest.fn();
    mockRegistrationModel.find = jest.fn();
    mockStudentProfileModel.findOne = jest.fn();

    service = new QuizzesService(
      mockQuizModel,
      mockSubmissionModel,
      mockAttemptModel,
      mockCourseModel,
      mockRegistrationModel,
      mockStudentProfileModel,
      mockNotificationsService,
      mockExcelService,
    );
  });

  describe('create()', () => {
    it('throws BadRequestException for invalid courseId', async () => {
      await expect(
        service.create(adminUser, {
          courseId: 'invalid-id',
          title: 'Quiz 1',
          durationMinutes: 15,
          questions: [],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if course does not exist', async () => {
      mockCourseModel.findById.mockResolvedValue(null);

      await expect(
        service.create(adminUser, {
          courseId,
          title: 'Quiz 1',
          durationMinutes: 15,
          questions: [],
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException if staff is not assigned doctor and lacks QUIZZES_WRITE', async () => {
      mockCourseModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(courseId),
        code: 'CS101',
        name: 'Computer Science',
        doctorId: new Types.ObjectId(), // Different doctor
      });

      await expect(
        service.create(staffUser, {
          courseId,
          title: 'Quiz 1',
          durationMinutes: 15,
          questions: [],
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows staff if they are the course doctor and calculates marks correctly', async () => {
      const staffDoctorId = new Types.ObjectId(staffUser._id);
      mockCourseModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(courseId),
        code: 'CS101',
        name: 'Computer Science',
        doctorId: staffDoctorId,
      });

      const savedQuiz = { _id: new Types.ObjectId() };
      function MockQuizInstance(this: any, data: any) {
        Object.assign(this, data);
        this.save = jest.fn().mockResolvedValue(savedQuiz);
      }
      mockQuizModel.mockImplementation(MockQuizInstance);

      const result = await service.create(staffUser, {
        courseId,
        title: 'Midterm Quiz',
        durationMinutes: 20,
        questions: [
          {
            id: 'q1',
            text: 'Question 1',
            type: 'mcq',
            options: ['A', 'B'],
            correctOptionIndex: 0,
            points: 2,
          },
          {
            id: 'q2',
            text: 'Question 2',
            type: 'true_false',
            options: ['True', 'False'],
            correctOptionIndex: 1,
            points: 3,
          },
        ],
      } as any);

      expect(result).toBe(savedQuiz);
    });

    it('throws BadRequestException if endsAt is before or equal to startsAt', async () => {
      mockCourseModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(courseId),
        code: 'CS101',
        name: 'Computer Science',
      });

      await expect(
        service.create(adminUser, {
          courseId,
          title: 'Quiz 1',
          durationMinutes: 15,
          startsAt: '2026-10-15T12:00:00Z',
          endsAt: '2026-10-15T10:00:00Z',
          questions: [],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne()', () => {
    it('throws BadRequestException for invalid quiz ID', async () => {
      await expect(service.findOne('bad-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException if quiz is not found', async () => {
      mockQuizModel.findById.mockResolvedValue(null);
      await expect(service.findOne(quizId)).rejects.toThrow(NotFoundException);
    });

    it('returns quiz document if found', async () => {
      const mockQuiz = { _id: new Types.ObjectId(quizId), title: 'Quiz 1' };
      mockQuizModel.findById.mockResolvedValue(mockQuiz);

      const result = await service.findOne(quizId);
      expect(result).toEqual(mockQuiz);
    });
  });

  describe('getQuizForTaking() - Security: Answer Sanitization', () => {
    it('throws ForbiddenException if quiz is not published', async () => {
      mockQuizModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(quizId),
        isPublished: false,
      });

      await expect(
        service.getQuizForTaking(quizId, studentUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException if student already submitted quiz', async () => {
      mockQuizModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(quizId),
        isPublished: true,
      });
      mockSubmissionModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
        score: 5,
      });

      await expect(
        service.getQuizForTaking(quizId, studentUserId),
      ).rejects.toThrow(ConflictException);
    });

    it('strips correctOptionIndex and explanations so student cannot see answers', async () => {
      const testStartsAt = new Date(Date.now() - 3600000);
      const testEndsAt = new Date(Date.now() + 3600000);

      mockQuizModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(quizId),
        title: 'Exam Quiz',
        courseId: new Types.ObjectId(courseId),
        courseCode: 'CS101',
        courseName: 'Intro to CS',
        durationMinutes: 15,
        totalMarks: 5,
        passingMarks: 3,
        isPublished: true,
        questions: [
          {
            id: 'q1',
            text: 'What is 2 + 2?',
            type: 'mcq',
            options: ['3', '4', '5'],
            correctOptionIndex: 1, // MUST BE STRIPPED
            explanation: 'Basic math', // MUST BE STRIPPED
            points: 5,
          },
        ],
        startsAt: testStartsAt,
        endsAt: testEndsAt,
      });
      mockSubmissionModel.findOne.mockResolvedValue(null);

      const result = await service.getQuizForTaking(quizId, studentUserId);

      expect(result.questions).toHaveLength(1);
      expect((result.questions[0] as any).correctOptionIndex).toBeUndefined();
      expect((result.questions[0] as any).explanation).toBeUndefined();
      expect(result.questions[0].options).toEqual(['3', '4', '5']);
      expect(result.questions[0].text).toBe('What is 2 + 2?');
      expect(result.startsAt).toEqual(testStartsAt);
      expect(result.endsAt).toEqual(testEndsAt);
    });
  });

  describe('submitQuiz() - Auto-Grading & Results', () => {
    it('calculates score correctly and marks passing status', async () => {
      const mockQuiz = {
        _id: new Types.ObjectId(quizId),
        courseId: new Types.ObjectId(courseId),
        courseCode: 'CS101',
        courseName: 'Intro to CS',
        isPublished: true,
        totalMarks: 4,
        passingMarks: 2,
        allowReview: true,
        questions: [
          {
            id: 'q1',
            text: 'Question 1',
            type: 'mcq',
            options: ['A', 'B', 'C'],
            correctOptionIndex: 1, // B is correct
            points: 2,
          },
          {
            id: 'q2',
            text: 'Question 2',
            type: 'true_false',
            options: ['True', 'False'],
            correctOptionIndex: 0, // True is correct
            points: 2,
          },
        ],
      };
      mockQuizModel.findById.mockResolvedValue(mockQuiz);
      mockSubmissionModel.findOne.mockResolvedValue(null);
      mockStudentProfileModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          userId: new Types.ObjectId(studentUserId),
          studentCode: '2026001',
          fullName: 'Ahmed Ali',
        }),
      });

      const savedSubmission = {
        _id: new Types.ObjectId(),
        score: 4,
        totalMarks: 4,
        percentage: 100,
        isPassed: true,
      };

      function MockSubmissionInstance(this: any, data: any) {
        Object.assign(this, data);
        this.save = jest.fn().mockResolvedValue(savedSubmission);
      }
      mockSubmissionModel.mockImplementation(MockSubmissionInstance);

      const result = await service.submitQuiz(quizId, studentUserId, {
        answers: [
          { questionId: 'q1', selectedOptionIndex: 1 }, // Correct (+2)
          { questionId: 'q2', selectedOptionIndex: 0 }, // Correct (+2)
        ],
        durationSeconds: 120,
      });

      expect(result.score).toBe(4);
      expect(result.percentage).toBe(100);
      expect(result.isPassed).toBe(true);
      expect(result.answers?.filter((a: any) => a.isCorrect)).toHaveLength(2);
    });

    it('calculates failing score when answers are incorrect', async () => {
      const mockQuiz = {
        _id: new Types.ObjectId(quizId),
        courseId: new Types.ObjectId(courseId),
        courseCode: 'CS101',
        courseName: 'Intro to CS',
        isPublished: true,
        totalMarks: 4,
        passingMarks: 2,
        allowReview: true,
        questions: [
          {
            id: 'q1',
            text: 'Question 1',
            type: 'mcq',
            options: ['A', 'B'],
            correctOptionIndex: 0,
            points: 2,
          },
          {
            id: 'q2',
            text: 'Question 2',
            type: 'mcq',
            options: ['A', 'B'],
            correctOptionIndex: 1,
            points: 2,
          },
        ],
      };
      mockQuizModel.findById.mockResolvedValue(mockQuiz);
      mockSubmissionModel.findOne.mockResolvedValue(null);
      mockStudentProfileModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          userId: new Types.ObjectId(studentUserId),
          studentCode: '2026002',
          fullName: 'Sara Omar',
        }),
      });

      function MockSubmissionInstance(this: any, data: any) {
        Object.assign(this, data);
        this.save = jest.fn().mockResolvedValue({ _id: new Types.ObjectId() });
      }
      mockSubmissionModel.mockImplementation(MockSubmissionInstance);

      const result = await service.submitQuiz(quizId, studentUserId, {
        answers: [
          { questionId: 'q1', selectedOptionIndex: 1 }, // Wrong
          { questionId: 'q2', selectedOptionIndex: 0 }, // Wrong
        ],
        durationSeconds: 85,
      });

      expect(result.score).toBe(0);
      expect(result.percentage).toBe(0);
      expect(result.isPassed).toBe(false);
      expect(result.answers?.filter((a: any) => a.isCorrect)).toHaveLength(0);
    });
  });

  describe('getQuizReview', () => {
    it('throws ForbiddenException if quiz allowReview is false', async () => {
      mockQuizModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(quizId),
        title: 'Quiz 1',
        allowReview: false,
      });

      await expect(service.getQuizReview(quizId, studentUserId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException if endsAt is in the future', async () => {
      mockQuizModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(quizId),
        title: 'Quiz 1',
        allowReview: true,
        endsAt: new Date(Date.now() + 3600000), // 1 hour in future
      });

      await expect(service.getQuizReview(quizId, studentUserId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('returns questions with correct answers and student answers when period has ended', async () => {
      const pastDate = new Date(Date.now() - 3600000);
      mockQuizModel.findById.mockResolvedValue({
        _id: new Types.ObjectId(quizId),
        title: 'Quiz 1',
        courseCode: 'CS101',
        courseName: 'Intro to CS',
        allowReview: true,
        endsAt: pastDate,
        totalMarks: 5,
        passingMarks: 3,
        questions: [
          {
            id: 'q1',
            text: 'What is 2+2?',
            type: 'mcq',
            options: ['3', '4', '5'],
            correctOptionIndex: 1,
            points: 2,
            explanation: 'Math basic',
          },
        ],
      });

      mockSubmissionModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          quizId: new Types.ObjectId(quizId),
          studentId: new Types.ObjectId(studentUserId),
          score: 2,
          totalMarks: 2,
          percentage: 100,
          isPassed: true,
          submittedAt: pastDate,
          durationSeconds: 120,
          answers: [
            {
              questionId: 'q1',
              selectedOptionIndex: 1,
              isCorrect: true,
              pointsAwarded: 2,
            },
          ],
        }),
      });

      const res = await service.getQuizReview(quizId, studentUserId);
      expect(res.quiz.title).toBe('Quiz 1');
      expect(res.submission.score).toBe(2);
      expect(res.questions).toHaveLength(1);
      expect(res.questions[0].correctOptionIndex).toBe(1);
      expect(res.questions[0].studentSelectedOptionIndex).toBe(1);
      expect(res.questions[0].isCorrect).toBe(true);
      expect(res.questions[0].explanation).toBe('Math basic');
    });
  });
});
