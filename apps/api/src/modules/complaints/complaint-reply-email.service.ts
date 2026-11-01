import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { isEmail } from 'class-validator';
import { Complaint } from './schemas/complaint.schema';
import { EmailsService } from '../emails/emails.service';
import {
  buildComplaintReplyEmail,
  getEmailPortalOrigin,
  brandedEmailSender,
} from '../emails/templates/email-content';
import { isServerlessRuntime } from '../../common/utils/runtime.util';
import { AppLoggerService } from '../../core/logger/logger.service';

@Injectable()
export class ComplaintReplyEmailService
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopping = false;

  constructor(
    @InjectModel(Complaint.name)
    private readonly complaints: Model<Complaint>,
    private readonly emails: EmailsService,
    private readonly logger: AppLoggerService,
  ) {}

  onModuleInit() {
    if (
      process.env.COMPLAINT_REPLY_EMAILS_ENABLED !== 'true' ||
      isServerlessRuntime()
    )
      return;
    this.timer = setInterval(() => this.start(), 30_000);
    this.timer.unref();
    this.start();
  }

  private start() {
    if (this.running || this.stopping) return;
    this.running = this.drain()
      .catch(() => {
        // Do not log addresses, message content or provider errors containing PII.
        this.logger.warn(
          'Complaint email dispatcher failed; pending events will retry',
        );
      })
      .finally(() => {
        this.running = undefined;
      });
  }

  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }

  async drain(): Promise<void> {
    if (process.env.COMPLAINT_REPLY_EMAILS_ENABLED !== 'true') return;
    const origin = getEmailPortalOrigin(
      process.env.WEB_BASE_URL || process.env.CLIENT_URL,
    );
    const from = process.env.EMAIL_SUPPORT_FROM;
    const replyTo = process.env.EMAIL_SUPPORT_REPLY_TO;
    if (
      !origin ||
      !from ||
      !replyTo ||
      !isEmail(replyTo) ||
      /[\r\n]/.test(from)
    ) {
      this.logger.warn(
        'Complaint emails need a valid portal origin, support sender and reply-to',
      );
      return;
    }
    // Bound each pass; multiple API processes compete using an atomic lease.
    for (let i = 0; i < 10 && !this.stopping; i++) {
      const now = new Date();
      const leaseId = randomUUID();
      const ticket = await this.complaints
        .findOneAndUpdate(
          {
            replyEmailEvents: {
              $elemMatch: {
                $or: [
                  { status: 'pending', nextAttemptAt: { $lte: now } },
                  { status: 'processing', leaseUntil: { $lte: now } },
                ],
              },
            },
          },
          {
            $set: {
              'replyEmailEvents.$.status': 'processing',
              'replyEmailEvents.$.leaseId': leaseId,
              'replyEmailEvents.$.leaseUntil': new Date(
                now.getTime() + 5 * 60_000,
              ),
            },
            $inc: { 'replyEmailEvents.$.attempts': 1 },
          },
          { new: true, timestamps: false },
        )
        .select('ticketNumber +replyEmailEvents')
        .lean();
      if (!ticket) return;
      const event = ticket.replyEmailEvents.find(
        (entry) => entry.leaseId === leaseId,
      );
      if (!event) throw new Error('Missing leased complaint email');

      // Resend deduplicates for 24h. Stop earlier so a lost acknowledgement
      // cannot produce another send outside the provider's deduplication window.
      const expired =
        now.getTime() - new Date(event.createdAt).getTime() >= 23 * 60 * 60_000;
      let status: 'pending' | 'sent' | 'failed' = 'failed';
      if (!expired && event.attempts <= 5) {
        try {
          const content = buildComplaintReplyEmail({
            ticketNumber: ticket.ticketNumber,
            lang: event.lang,
            portalUrl: origin,
          });
          await this.emails.sendTransactional(
            {
              to: [event.to],
              event: 'complaint_reply',
              ...content,
            },
            {
              from: brandedEmailSender(from, 'BHI47A Support'),
              replyTo,
              eventKey: event.eventKey,
            },
          );
          status = 'sent';
        } catch {
          status = event.attempts < 5 ? 'pending' : 'failed';
          this.logger.warn(
            'Complaint email delivery failed; see email log status',
          );
        }
      }
      await this.complaints.updateOne(
        {
          _id: ticket._id,
          replyEmailEvents: {
            $elemMatch: { eventKey: event.eventKey, leaseId },
          },
        },
        {
          $set: {
            'replyEmailEvents.$.status': status,
            'replyEmailEvents.$.nextAttemptAt': new Date(
              Date.now() + Math.min(60 * 60_000, 30_000 * 2 ** event.attempts),
            ),
          },
          $unset: {
            'replyEmailEvents.$.leaseId': '',
            'replyEmailEvents.$.leaseUntil': '',
          },
        },
        { timestamps: false },
      );
    }
  }
}
