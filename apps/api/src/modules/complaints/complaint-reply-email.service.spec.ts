import { ComplaintReplyEmailService } from './complaint-reply-email.service';
import { ComplaintsService } from './complaints.service';
import { Types, model } from 'mongoose';
import { ComplaintSchema } from './schemas/complaint.schema';
import { PublicReplyComplaintDto } from './dto/complaint.dto';
import { validate } from 'class-validator';

describe('complaint reply email outbox', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    process.env.COMPLAINT_REPLY_EMAILS_ENABLED = 'true';
    process.env.EMAIL_SUPPORT_FROM = 'support@bhi47.app';
    process.env.EMAIL_SUPPORT_REPLY_TO = 'support@bhi47.app';
    process.env.WEB_BASE_URL = 'https://bhi47.app';
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function dispatcher(
    options: { fails?: boolean; attempts?: number; age?: number } = {},
  ) {
    const event = {
      eventKey: 'complaint-reply-stable',
      to: 'student@example.com',
      lang: 'en',
      status: 'processing',
      attempts: options.attempts ?? 1,
      createdAt: new Date(Date.now() - (options.age ?? 0)),
      leaseId: '',
    };
    let claimed = false;
    const findOneAndUpdate = jest
      .fn()
      .mockImplementation((_filter, update) => ({
        select: () => ({
          lean: () => {
            if (claimed) return null;
            claimed = true;
            event.leaseId = update.$set['replyEmailEvents.$.leaseId'];
            return {
              _id: new Types.ObjectId(),
              ticketNumber: 'TKT-1234',
              replyEmailEvents: [event],
            };
          },
        }),
      }));
    const updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const sendTransactional = options.fails
      ? jest.fn().mockRejectedValue(new Error('provider down'))
      : jest.fn().mockResolvedValue(undefined);
    const service = new ComplaintReplyEmailService(
      { findOneAndUpdate, updateOne } as never,
      { sendTransactional } as never,
      { warn: jest.fn() } as never,
    );
    return { service, findOneAndUpdate, updateOne, sendTransactional };
  }

  it('leases due work atomically and sends a minimal notification with stable deduplication key', async () => {
    const test = dispatcher();
    await test.service.drain();
    expect(test.sendTransactional).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['student@example.com'],
        event: 'complaint_reply',
        subject: expect.stringContaining('New reply'),
      }),
      expect.objectContaining({
        eventKey: 'complaint-reply-stable',
        replyTo: 'support@bhi47.app',
      }),
    );
    expect(test.updateOne.mock.calls[0][0].replyEmailEvents.$elemMatch).toEqual(
      {
        eventKey: 'complaint-reply-stable',
        leaseId: expect.any(String),
      },
    );
    expect(
      test.updateOne.mock.calls[0][1].$set['replyEmailEvents.$.status'],
    ).toBe('sent');
    expect(
      test.findOneAndUpdate.mock.calls[0][0].replyEmailEvents.$elemMatch.$or,
    ).toHaveLength(2);
  });
  it('reschedules provider failures and preserves the event for retry', async () => {
    const test = dispatcher({ fails: true });
    await test.service.drain();
    const state = test.updateOne.mock.calls[0][1].$set;
    expect(state['replyEmailEvents.$.status']).toBe('pending');
    expect(state['replyEmailEvents.$.nextAttemptAt'].getTime()).toBeGreaterThan(
      Date.now(),
    );
  });
  it.each([{ attempts: 5, fails: true }, { age: 24 * 60 * 60_000 }])(
    'stops bounded retries / expired events: %j',
    async (options) => {
      const test = dispatcher(options);
      await test.service.drain();
      expect(
        test.updateOne.mock.calls[0][1].$set['replyEmailEvents.$.status'],
      ).toBe('failed');
      if ('age' in options)
        expect(test.sendTransactional).not.toHaveBeenCalled();
    },
  );
  it('does not claim events when disabled or sender configuration is missing', async () => {
    const test = dispatcher();
    process.env.COMPLAINT_REPLY_EMAILS_ENABLED = 'false';
    await test.service.drain();
    process.env.COMPLAINT_REPLY_EMAILS_ENABLED = 'true';
    delete process.env.EMAIL_SUPPORT_FROM;
    await test.service.drain();
    expect(test.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('does not start a background timer on serverless', () => {
    process.env.VERCEL = '1';
    const test = dispatcher();
    test.service.onModuleInit();
    expect(test.findOneAndUpdate).not.toHaveBeenCalled();
  });

  function replying(contactEmail?: string, linked = true) {
    const studentId = new Types.ObjectId();
    const senderId = new Types.ObjectId();
    const ticket = {
      _id: new Types.ObjectId(),
      studentId,
      studentCode: '2026001',
      nationalId: '30001011234567',
      contactEmail,
      notificationLocale: 'en',
      ticketNumber: 'TKT-1',
      status: 'in_progress',
      replies: [] as unknown[],
      replyEmailEvents: [] as unknown[],
      save: jest.fn(),
    };
    ticket.save.mockResolvedValue(ticket);
    const service = new ComplaintsService(
      { findById: () => ({ select: () => Promise.resolve(ticket) }) } as never,
      {} as never,
      {
        findById: jest.fn().mockImplementation((id) =>
          String(id) === String(studentId)
            ? {
                _id: studentId,
                name: 'Student',
                googleId: linked ? 'verified-google-sub' : undefined,
                googleEmail: 'linked@example.com',
                googleLinkPending: false,
              }
            : { _id: senderId, name: 'Support' },
        ),
      } as never,
      { log: jest.fn(), error: jest.fn() } as never,
      { sendNotification: jest.fn().mockResolvedValue(undefined) } as never,
    );
    return { service, ticket, senderId, studentId };
  }
  it.each([
    ['public@example.com', true, 'public@example.com'],
    [undefined, true, 'linked@example.com'],
    [undefined, false, undefined],
    ['invalid', true, undefined],
  ])(
    'chooses complaint contact then verified linked email (%s)',
    async (contact, linked, expected) => {
      const test = replying(contact, linked);
      await test.service.addReply(
        String(test.ticket._id),
        { message: 'private reply' },
        String(test.senderId),
        'staff',
      );
      expect(test.ticket.save).toHaveBeenCalledTimes(1);
      expect(test.ticket.replyEmailEvents).toHaveLength(expected ? 1 : 0);
      if (expected)
        expect(test.ticket.replyEmailEvents[0]).toMatchObject({
          to: expected,
          lang: 'en',
          status: 'pending',
        });
      expect(JSON.stringify(test.ticket.replyEmailEvents)).not.toContain(
        'private reply',
      );
    },
  );
  it('does not create an email for student replies', async () => {
    const test = replying('public@example.com');
    jest
      .spyOn(test.service as never, 'countTodayStudentReplies')
      .mockResolvedValue(0 as never);
    await test.service.addReply(
      String(test.ticket._id),
      { message: 'student reply' },
      String(test.studentId),
      'student',
    );
    expect(test.ticket.replyEmailEvents).toHaveLength(0);
  });
  it('rejects replies from another student before saving', async () => {
    const test = replying();
    await expect(
      test.service.addReply(
        String(test.ticket._id),
        { message: 'no' },
        String(test.senderId),
        'student',
      ),
    ).rejects.toThrow();
    expect(test.ticket.save).not.toHaveBeenCalled();
  });
  it('removes internal outbox data from JSON / object API serialization', () => {
    const Ticket = model('ComplaintEmailSerializationTest', ComplaintSchema);
    const ticket = new Ticket({
      replyEmailEvents: [
        { eventKey: 'key', to: 'private@example.com', lang: 'en' },
      ],
    });
    expect(ticket.toJSON()).not.toHaveProperty('replyEmailEvents');
    expect(ticket.toObject()).not.toHaveProperty('replyEmailEvents');
  });

  it('requires a valid national ID on public reply requests', async () => {
    for (const nationalId of [undefined, '123', 'not-a-national-id']) {
      const dto = Object.assign(new PublicReplyComplaintDto(), {
        ticketNumber: 'TKT-1',
        studentCode: '2026001',
        message: 'Reply',
        nationalId,
      });
      expect(
        (await validate(dto)).some((entry) => entry.property === 'nationalId'),
      ).toBe(true);
    }
  });

  it('does not fetch or disclose a public conversation when identity verification fails', async () => {
    const findOne = jest.fn();
    const service = new ComplaintsService(
      { findOne } as never,
      {} as never,
      {
        findOne: () => ({
          select: () => ({
            nationalId: '30001011234567',
            studentCode: '2026001',
          }),
        }),
      } as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.publicReply({
        ticketNumber: 'TKT-1',
        studentCode: '2026001',
        nationalId: '30001011234568',
        message: 'Reply',
      }),
    ).rejects.toThrow('Verification failed');
    expect(findOne).not.toHaveBeenCalled();
  });

  it('allows a verified public reply without generating a staff notification email', async () => {
    const studentId = new Types.ObjectId();
    const ticket = {
      studentId,
      studentCode: '2026001',
      status: 'open',
      replies: [] as unknown[],
      save: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ComplaintsService(
      { findOne: jest.fn().mockResolvedValue(ticket) } as never,
      {} as never,
      {
        findOne: () => ({
          select: () => ({
            _id: studentId,
            nationalId: '30001011234567',
            studentCode: '2026001',
          }),
        }),
      } as never,
      {} as never,
      {} as never,
    );
    expect(
      await service.publicReply({
        ticketNumber: 'TKT-1',
        studentCode: '2026001',
        nationalId: '30001011234567',
        message: 'Reply',
      }),
    ).toMatchObject({ success: true });
    expect(ticket.save).toHaveBeenCalledTimes(1);
    expect(ticket.replies).toHaveLength(1);
  });
});
