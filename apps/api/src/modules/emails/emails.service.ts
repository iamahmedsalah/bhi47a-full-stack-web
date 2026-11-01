import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bullmq';
import { Model, Types } from 'mongoose';
import { Resend } from 'resend';
import { connect as connectTls, TLSSocket } from 'node:tls';
import { QueueService } from '../../core/queues/queue.service';
import {
  buildPaginationOptions,
  createPaginatedResult,
} from '../../common/utils/pagination.util';
import { SendEmailDto, QueryEmailLogDto } from './dto/email.dto';
import { EmailLog, EmailLogDocument } from './schemas/email-log.schema';
import { brandedEmailSender } from './templates/email-content';

interface EmailJob {
  emailLogId: string;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
  idempotencyKey?: string;
}

/** Internal service options, deliberately absent from the public SendEmailDto. */
export interface TransactionalEmailOptions {
  from: string;
  replyTo: string;
  eventKey: string;
}

type SmtpCode = 220 | 221 | 235 | 250 | 334 | 354;

@Injectable()
export class EmailsService implements OnModuleInit {
  private readonly resend?: Resend;
  private readonly fromEmail = brandedEmailSender(
    process.env.SMTP_FROM_EMAIL ||
      process.env.EMAIL_FROM ||
      process.env.RESEND_FROM_EMAIL ||
      'Student Portal <noreply@student-portal.local>',
    process.env.EMAIL_FROM_NAME,
  );
  private readonly smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  private readonly smtpPort = Number(process.env.SMTP_PORT || 465);
  private readonly smtpUser = process.env.SMTP_USER;
  private readonly smtpPass = process.env.SMTP_PASS;

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
      'send-email',
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

  // Used by the durable complaint dispatcher, outside the HTTP request and
  // independent of BullMQ being enabled. Never silently simulate these emails.
  async sendTransactional(
    dto: SendEmailDto,
    options: TransactionalEmailOptions,
  ) {
    if (!this.resend && !this.isSmtpConfigured()) {
      throw new Error('Email provider is not configured');
    }
    if (/[\r\n]/.test(options.from + options.replyTo)) {
      throw new Error('Invalid email headers');
    }
    const log = await this.emailLogModel.findOneAndUpdate(
      { eventKey: options.eventKey },
      {
        $setOnInsert: {
          to: dto.to,
          subject: dto.subject,
          text: dto.text,
          html: dto.html,
          event: dto.event,
          eventKey: options.eventKey,
          from: options.from,
          replyTo: options.replyTo,
          status: 'pending',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    if (log.status === 'sent') return;
    await this.deliverEmail({
      emailLogId: log._id.toString(),
      to: log.to,
      subject: log.subject,
      text: log.text,
      html: log.html,
      from: log.from,
      replyTo: log.replyTo,
      idempotencyKey: options.eventKey,
    });
  }

  private async deliverEmail(data: EmailJob) {
    try {
      const providerId = this.isSmtpConfigured()
        ? await this.deliverWithSmtp(data)
        : await this.deliverWithResend(data);

      await this.emailLogModel.findByIdAndUpdate(data.emailLogId, {
        $set: {
          status: providerId === 'simulation' ? 'skipped' : 'sent',
          providerId,
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

  private async deliverWithResend(data: EmailJob) {
    if (!this.resend) {
      console.log(
        `[Email Simulation] To: ${data.to.join(', ')} | Subject: "${data.subject}"`,
      );
      return 'simulation';
    }

    const payload = data.html
      ? {
          from: data.from || this.fromEmail,
          to: data.to,
          subject: data.subject,
          html: data.html,
          ...(data.text ? { text: data.text } : {}),
        }
      : {
          from: data.from || this.fromEmail,
          to: data.to,
          subject: data.subject,
          text: data.text || '',
        };

    const response = await this.resend.emails.send(
      { ...payload, ...(data.replyTo ? { replyTo: data.replyTo } : {}) },
      data.idempotencyKey ? { idempotencyKey: data.idempotencyKey } : undefined,
    );

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data?.id || 'resend';
  }

  private async deliverWithSmtp(data: EmailJob) {
    if (!this.smtpUser || !this.smtpPass) {
      throw new Error('SMTP_USER and SMTP_PASS are required for SMTP delivery');
    }

    const socket = await this.createSmtpSocket();
    let buffer = '';

    const readResponse = (expected: SmtpCode[]) =>
      new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('SMTP response timed out'));
        }, 20000);

        const cleanup = () => {
          clearTimeout(timeout);
          socket.off('data', onData);
          socket.off('error', onError);
        };

        const onError = (error: Error) => {
          cleanup();
          reject(error);
        };

        const onData = (chunk: Buffer | string) => {
          buffer += chunk.toString();
          const lines = buffer.split(/\r?\n/).filter(Boolean);
          const lastLine = lines[lines.length - 1];
          const complete = !!lastLine && /^\d{3} /.test(lastLine);
          if (!complete) return;

          const response = buffer;
          buffer = '';
          cleanup();

          const code = Number.parseInt(lastLine.slice(0, 3), 10);
          if (!expected.includes(code as SmtpCode)) {
            reject(
              new Error(
                `SMTP expected ${expected.join('/')} but received ${response.trim()}`,
              ),
            );
            return;
          }
          resolve(response);
        };

        socket.on('data', onData);
        socket.on('error', onError);
      });

    const sendCommand = async (command: string, expected: SmtpCode[]) => {
      socket.write(`${command}\r\n`);
      return readResponse(expected);
    };

    const quit = () => {
      socket.write('QUIT\r\n');
      socket.end();
    };

    try {
      await readResponse([220]);
      await sendCommand('EHLO student-portal.local', [250]);
      await sendCommand('AUTH LOGIN', [334]);
      await sendCommand(Buffer.from(this.smtpUser).toString('base64'), [334]);
      await sendCommand(Buffer.from(this.smtpPass).toString('base64'), [235]);
      await sendCommand(
        `MAIL FROM:<${this.extractEmailAddress(data.from || this.fromEmail)}>`,
        [250],
      );
      for (const recipient of data.to) {
        await sendCommand(`RCPT TO:<${recipient}>`, [250]);
      }
      await sendCommand('DATA', [354]);
      socket.write(`${this.buildMimeMessage(data)}\r\n.\r\n`);
      await readResponse([250]);
      quit();
      return `smtp:${this.smtpHost}`;
    } catch (error) {
      socket.destroy();
      throw error;
    }
  }

  private createSmtpSocket() {
    return new Promise<TLSSocket>((resolve, reject) => {
      const socket = connectTls({
        host: this.smtpHost,
        port: this.smtpPort,
        servername: this.smtpHost,
      });

      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error('SMTP connection timed out'));
      }, 20000);

      socket.once('secureConnect', () => {
        clearTimeout(timeout);
        resolve(socket);
      });
      socket.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private buildMimeMessage(data: EmailJob) {
    const boundary = `student-portal-${Date.now()}`;
    const headers = [
      `From: ${data.from || this.fromEmail}`,
      ...(data.replyTo ? [`Reply-To: ${data.replyTo}`] : []),
      `To: ${data.to.join(', ')}`,
      `Subject: ${this.encodeHeader(data.subject)}`,
      'MIME-Version: 1.0',
    ];

    if (data.html) {
      return this.dotStuff(
        [
          ...headers,
          `Content-Type: multipart/alternative; boundary="${boundary}"`,
          '',
          `--${boundary}`,
          'Content-Type: text/plain; charset=UTF-8',
          'Content-Transfer-Encoding: 8bit',
          '',
          data.text || this.htmlToText(data.html),
          `--${boundary}`,
          'Content-Type: text/html; charset=UTF-8',
          'Content-Transfer-Encoding: 8bit',
          '',
          data.html,
          `--${boundary}--`,
        ].join('\r\n'),
      );
    }

    return this.dotStuff(
      [
        ...headers,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        data.text || '',
      ].join('\r\n'),
    );
  }

  private isSmtpConfigured() {
    return Boolean(this.smtpUser && this.smtpPass);
  }

  private extractEmailAddress(value: string) {
    const match = value.match(/<([^>]+)>/);
    return (match?.[1] || value).trim();
  }

  private encodeHeader(value: string) {
    return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
  }

  private dotStuff(value: string) {
    return value.replace(/^\./gm, '..');
  }

  private htmlToText(value: string) {
    return value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
