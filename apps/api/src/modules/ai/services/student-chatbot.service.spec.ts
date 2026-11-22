import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { MongoRateLimiterStore } from '../../../common/rate-limit/mongo-rate-limiter.store';
import { StudentChatbotService } from './student-chatbot.service';
import { AiSettingsService } from './ai-settings.service';

describe('student assistant boundaries', () => {
  const studentId = new Types.ObjectId().toHexString();

  function fixture() {
    const sessionId = new Types.ObjectId();
    const gemini = { chat: jest.fn() };
    const rag = { findAnswer: jest.fn(), retrieveCourses: jest.fn() };
    const grades = { findStudentResults: jest.fn() };
    const sessions = {
      findOne: jest.fn(),
      create: jest.fn().mockResolvedValue({ _id: sessionId }),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    const logs = { create: jest.fn().mockResolvedValue({}) };
    const service = new StudentChatbotService(
      gemini as never,
      rag as never,
      { isStudentAdvisorEnabled: () => Promise.resolve(true) } as never,
      sessions as never,
      logs as never,
      grades as never,
    );
    return { service, rag, gemini, grades, sessions, sessionId, logs };
  }

  beforeEach(() => {
    jest.spyOn(MongoRateLimiterStore.prototype, 'increment').mockResolvedValue({
      count: 1,
      remaining: 4,
      resetAt: Date.now() + 1000,
      retryAfterSeconds: 1,
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('uses the signed-in student and the same results service, without persisting marks or calling Gemini', async () => {
    const f = fixture();
    f.grades.findStudentResults.mockResolvedValue([
      {
        courseNameAr: 'قواعد البيانات',
        examType: 'final',
        grade: 78,
        maxGrade: 100,
      },
    ]);
    const reply = await f.service.chat(
      studentId,
      'ما درجاتي؟',
      undefined,
      'ar',
    );
    expect(reply.answer).toContain('78/100');
    expect(f.grades.findStudentResults).toHaveBeenCalledWith(studentId);
    expect(f.gemini.chat).not.toHaveBeenCalled();
    expect(JSON.stringify(f.sessions.updateOne.mock.calls)).not.toContain(
      '78/100',
    );
  });

  it('answers approved FAQs and declines unmatched questions without a provider call', async () => {
    const f = fixture();
    f.rag.findAnswer.mockResolvedValueOnce(
      'Open Complaints to send an inquiry.',
    );
    expect(
      (await f.service.chat(studentId, 'How do I file a complaint?')).answer,
    ).toBe('Open Complaints to send an inquiry.');
    expect(
      (await f.service.chat(studentId, 'Unknown question')).answer,
    ).toContain('verified information');
    expect(f.gemini.chat).not.toHaveBeenCalled();
  });

  it('passes only a generic task and retrieved catalog data to Gemini', async () => {
    const f = fixture();
    const original = 'Anonymous Name: credit hours for BIS101';
    f.rag.retrieveCourses.mockResolvedValue('Verified catalog detail');
    f.gemini.chat.mockResolvedValue({
      content: 'Three hours.',
      model: 'test-model',
      usage: { promptTokens: 3, completionTokens: 1, totalTokens: 4 },
    });
    expect((await f.service.chat(studentId, original)).answer).toBe(
      'Three hours.',
    );
    expect(JSON.stringify(f.gemini.chat.mock.calls)).toContain(
      'Verified catalog detail',
    );
    expect(JSON.stringify(f.gemini.chat.mock.calls)).not.toContain(original);
    expect(f.grades.findStudentResults).not.toHaveBeenCalled();
  });

  it('rejects obvious identifiers before retrieval and redacts them in history', async () => {
    const f = fixture();
    const message = 'Check grades for 123456';
    await f.service.chat(studentId, message);
    expect(f.rag.findAnswer).not.toHaveBeenCalled();
    expect(f.gemini.chat).not.toHaveBeenCalled();
    expect(JSON.stringify(f.sessions.updateOne.mock.calls)).not.toContain(
      message,
    );
  });

  it('requires a production opt-in, provider key and explicit chat model', async () => {
    const findOne = jest.fn();
    const settings = new AiSettingsService(
      new ConfigService({ NODE_ENV: 'production', STUDENT_AI_ENABLED: 'true' }),
      { findOne } as never,
      {} as never,
    );
    await expect(settings.getStudentStatus()).resolves.toEqual({
      enabled: false,
    });
    expect(findOne).not.toHaveBeenCalled();
  });

  it('answers from grounded syllabus PDF excerpts with verified server-side citations and ignores ungrounded answers', async () => {
    const f = fixture();
    const evidenceMap = new Map([
      [
        'S1',
        {
          sourceId: 'S1',
          courseId: new Types.ObjectId().toHexString(),
          courseCode: 'BIS201',
          courseTitle: 'نظم قواعد البيانات',
          fileName: 'bis201.pdf',
          pageNumber: 7,
          score: 0.92,
        },
      ],
    ]);

    Object.assign(f.rag, {
      retrieveDocumentExcerpts: jest.fn().mockResolvedValue({
        contextPrompt:
          '<document_excerpt id="S1" course="BIS201 - نظم قواعد البيانات" page="7">\nدرجة أعمال السنة 20 درجة.\n</document_excerpt>',
        evidenceMap,
        chunks: [],
      }),
      verifyDocumentCitations: jest.fn().mockReturnValue({
        grounded: true,
        answer: 'درجة أعمال السنة في المقرر هي 20 درجة [S1].',
        sources: [...evidenceMap.values()],
      }),
    });

    f.gemini.chat.mockResolvedValue({
      content: 'درجة أعمال السنة في المقرر هي 20 درجة [S1].',
      model: 'gemini-2.5-flash',
      usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
    });

    const reply = await f.service.chat(
      studentId,
      'كم درجة أعمال السنة في نظم قواعد البيانات؟',
      undefined,
      'ar',
    );

    expect(reply.answer).toContain('20 درجة [S1]');
    expect(reply.sources).toEqual([
      expect.objectContaining({
        sourceId: 'S1',
        courseCode: 'BIS201',
        pageNumber: 7,
      }),
    ]);
    expect(f.rag.retrieveCourses).not.toHaveBeenCalled();
  });

  it('streams SSE events (meta -> token -> done) and resolves verified citations on done', async () => {
    const f = fixture();
    const evidenceMap = new Map([
      [
        'S1',
        {
          sourceId: 'S1',
          courseId: new Types.ObjectId().toHexString(),
          courseCode: 'BIS201',
          courseTitle: 'نظم قواعد البيانات',
          fileName: 'bis201.pdf',
          pageNumber: 3,
          score: 0.95,
        },
      ],
    ]);

    Object.assign(f.rag, {
      retrieveDocumentExcerpts: jest.fn().mockResolvedValue({
        contextPrompt:
          '<document_excerpt id="S1" course="BIS201" page="3">Final exam is 60 marks.</document_excerpt>',
        evidenceMap,
        chunks: [],
      }),
      verifyDocumentCitations: jest.fn().mockReturnValue({
        grounded: true,
        answer: 'الامتحان النهائي من 60 درجة [S1].',
        sources: [...evidenceMap.values()],
      }),
    });

    Object.assign(f.gemini, {
      chatStream: async function* () {
        await Promise.resolve();
        yield { delta: 'الامتحان النهائي ' };
        yield { delta: 'من 60 درجة [S1].' };
        yield {
          delta: '',
          done: true,
          model: 'gemini-2.5-flash',
          usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
        };
      },
    });

    const events = [];
    for await (const ev of f.service.chatStream(
      studentId,
      'كم درجة الامتحان النهائي في قواعد البيانات؟',
      undefined,
      'ar',
    )) {
      events.push(ev);
    }

    expect(events[0].event).toBe('meta');
    expect(events.filter((e) => e.event === 'token')).toHaveLength(2);
    const doneEvent = events[events.length - 1];
    expect(doneEvent.event).toBe('done');
    expect(doneEvent.data.answer).toBe('الامتحان النهائي من 60 درجة [S1].');
    expect(doneEvent.data.sources).toEqual([
      expect.objectContaining({
        sourceId: 'S1',
        pageNumber: 3,
      }),
    ]);
  });
});
