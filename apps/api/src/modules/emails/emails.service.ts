import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bullmq';
import { Model, Types } from 'mongoose';
import { Resend } from 'resend';
import { QueueService } from '../../core/queues/queue.service';
import {
  buildPaginationOptions,
  createPaginatedResult,
} from '../../common/utils/pagination.util';
import { SendEmailDto, QueryEmailLogDto } from './dto/email.dto';
import { EmailLog, EmailLogDocument } from './schemas/email-log.schema';

interface EmailJob {
  emailLogId: string;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
}

@Injectable()
export class EmailsService implements OnModuleInit {
  private readonly resend?: Resend;
  private readonly fromEmail =
    process.env.RESEND_FROM_EMAIL ||
    'Student Portal <noreply@student-portal.local>';

  constructor(
    @InjectModel(EmailLog.name)
    private emailLogModel: Model<EmailLogDocument>,
    private queueService: QueueService,
  ) {
    if (process.env.RESEND_API_KEY) {
      this.resend = new Resend(process.env.RESEND_API_KEY);
    }
  }

  onModuleInit() {
    this.queueService.registerWorker<EmailJob>(
      'emails',
      async (job: Job<EmailJob>) => this.deliverEmail(job.data),
    );
  }

  async send(dto: SendEmailDto, requestedBy?: string) {
    if (!dto.text && !dto.html) {
      throw new BadRequestException('Email text or html body is required');
    }

    const log = new this.emailLogModel({
      to: dto.to,
      subject: dto.subject,
      text: dto.text,
      html: dto.html,
      event: dto.event || 'manual',
      requestedBy: requestedBy ? new Types.ObjectId(requestedBy) : undefined,
    });

    await log.save();

    log.status = this.queueService.enabled ? 'queued' : 'pending';
    log.queuedAt = new Date();
    await log.save();

    await this.queueService.add<EmailJob>(
      'emails',
      'send-resend',
      {
        emailLogId: log._id.toString(),
        to: dto.to,
        subject: dto.subject,
        text: dto.text,
        html: dto.html,
      },
      (data) => this.deliverEmail(data),
    );

    return (await this.emailLogModel.findById(log._id)) || log;
  }

  async list(query: QueryEmailLogDto) {
    const { page, limit, skip } = buildPaginationOptions(query);
    const filter: Record<string, string> = {};

    if (query.status) {
      filter.status = query.status;
    }

    if (query.event) {
      filter.event = query.event;
    }

    const [items, total] = await Promise.all([
      this.emailLogModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('requestedBy', 'name email')
        .lean(),
      this.emailLogModel.countDocuments(filter),
    ]);

    return createPaginatedResult(items, total, page, limit);
  }

  private async deliverEmail(data: EmailJob) {
    if (!this.resend) {
      await this.emailLogModel.findByIdAndUpdate(data.emailLogId, {
        $set: {
          status: 'skipped',
          error: 'RESEND_API_KEY is not configured',
          sentAt: new Date(),
        },
      });
      console.log(
        `[Email Simulation] To: ${data.to.join(', ')} | Subject: "${data.subject}"`,
      );
      return;
    }

    try {
      const payload = data.html
        ? {
            from: this.fromEmail,
            to: data.to,
            subject: data.subject,
            html: data.html,
            ...(data.text ? { text: data.text } : {}),
          }
        : {
            from: this.fromEmail,
            to: data.to,
            subject: data.subject,
            text: data.text || '',
          };

      const response = await this.resend.emails.send(payload);

      if (response.error) {
        throw new Error(response.error.message);
      }

      await this.emailLogModel.findByIdAndUpdate(data.emailLogId, {
        $set: {
          status: 'sent',
          providerId: response.data?.id,
          sentAt: new Date(),
        },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.emailLogModel.findByIdAndUpdate(data.emailLogId, {
        $set: {
          status: 'failed',
          error: errorMessage,
          sentAt: new Date(),
        },
      });
      throw err;
    }
  }
}
