import mongoose from 'mongoose';
import type { Connection, Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { ComplaintReplyEmailService } from '../src/modules/complaints/complaint-reply-email.service';
import {
  ComplaintSchema,
  type Complaint,
} from '../src/modules/complaints/schemas/complaint.schema';

describe('complaint email outbox (isolated MongoDB)', () => {
  let connection: Connection | undefined;
  let tickets: Model<Complaint>;
  const env = { ...process.env };
  const collection = `complaint_email_e2e_${randomUUID().replaceAll('-', '')}`;
  beforeAll(async () => {
    const uri = new URL(process.env.MONGODB_URI ?? 'http://invalid');
    if (
      uri.protocol !== 'mongodb:' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(uri.hostname) ||
      uri.username ||
      uri.password ||
      uri.search ||
      !/[-_](test|e2e)$/.test(uri.pathname)
    ) {
      throw new Error('Credential-free localhost test/e2e database required');
    }
    connection = await mongoose
      .createConnection(uri.href, {
        serverSelectionTimeoutMS: 3000,
        autoIndex: false,
        autoCreate: false,
      })
      .asPromise();
    tickets = connection.model<Complaint>(
      'ComplaintEmailE2e',
      ComplaintSchema,
      collection,
    );
    process.env.COMPLAINT_REPLY_EMAILS_ENABLED = 'true';
    process.env.WEB_BASE_URL = 'https://bhi47.app';
    process.env.EMAIL_SUPPORT_FROM = 'support@bhi47.app';
    process.env.EMAIL_SUPPORT_REPLY_TO = 'support@bhi47.app';
  });
  afterAll(async () => {
    process.env = env;
    if (connection) {
      if (tickets) await tickets.collection.drop().catch(() => undefined);
      await connection.close();
    }
  });

  async function fixture(expiredLease = false) {
    return tickets.create({
      ticketNumber: `TKT-${randomUUID()}`,
      studentId: new mongoose.Types.ObjectId(),
      studentCode: '999999',
      studentName: 'Synthetic Student',
      title: 'Synthetic ticket',
      description: 'Not a real complaint',
      replyEmailEvents: [
        {
          eventKey: `reply-${randomUUID()}`,
          to: 'synthetic@example.com',
          lang: 'en',
          status: expiredLease ? 'processing' : 'pending',
          attempts: expiredLease ? 1 : 0,
          ...(expiredLease
            ? { leaseId: 'dead-process', leaseUntil: new Date(0) }
            : {}),
        },
      ],
    });
  }
  function dispatcher(sendTransactional: jest.Mock) {
    return new ComplaintReplyEmailService(
      tickets,
      { sendTransactional } as never,
      { warn: jest.fn() } as never,
    );
  }
  it('allows competing dispatchers to claim each event only once', async () => {
    const ticket = await fixture();
    const send = jest
      .fn()
      .mockImplementation(
        () => new Promise<void>((resolve) => setTimeout(resolve, 25)),
      );
    await Promise.all([dispatcher(send).drain(), dispatcher(send).drain()]);
    expect(send).toHaveBeenCalledTimes(1);
    const stored = await tickets
      .findById(ticket._id)
      .select('+replyEmailEvents')
      .lean();
    expect(stored?.replyEmailEvents[0]).toMatchObject({
      status: 'sent',
      attempts: 1,
    });
    expect(stored?.replyEmailEvents[0].leaseId).toBeUndefined();
  });
  it('recovers expired leases after a process interruption', async () => {
    const ticket = await fixture(true);
    const send = jest.fn().mockResolvedValue(undefined);
    await dispatcher(send).drain();
    expect(send).toHaveBeenCalledTimes(1);
    const stored = await tickets
      .findById(ticket._id)
      .select('+replyEmailEvents')
      .lean();
    expect(stored?.replyEmailEvents[0]).toMatchObject({
      status: 'sent',
      attempts: 2,
    });
  });
  it('keeps the event after failure and reuses its identity on retry', async () => {
    const ticket = await fixture();
    const send = jest
      .fn()
      .mockRejectedValueOnce(new Error('simulated provider failure'))
      .mockResolvedValue(undefined);
    await dispatcher(send).drain();
    let stored = await tickets
      .findById(ticket._id)
      .select('+replyEmailEvents')
      .lean();
    expect(stored?.replyEmailEvents[0].status).toBe('pending');
    await tickets.updateOne(
      { _id: ticket._id },
      { $set: { 'replyEmailEvents.0.nextAttemptAt': new Date(0) } },
    );
    await dispatcher(send).drain();
    stored = await tickets
      .findById(ticket._id)
      .select('+replyEmailEvents')
      .lean();
    expect(stored?.replyEmailEvents[0].status).toBe('sent');
    expect(send.mock.calls[0][1].eventKey).toBe(send.mock.calls[1][1].eventKey);
  });
});
