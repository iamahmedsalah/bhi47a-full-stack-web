import { Types } from 'mongoose';
import { EmailsService } from './emails.service';

describe('transactional complaint delivery', () => {
  function setup(status = 'pending') {
    const log = {
      _id: new Types.ObjectId(),
      status,
      to: ['student@example.com'],
      subject: 'Original subject',
      text: 'Original text',
      html: '<p>Original</p>',
      from: 'Support <support@bhi47.app>',
      replyTo: 'support@bhi47.app',
    };
    const findOneAndUpdate = jest.fn().mockResolvedValue(log);
    const findByIdAndUpdate = jest.fn().mockResolvedValue(log);
    const service = new EmailsService(
      { findOneAndUpdate, findByIdAndUpdate } as never,
      {} as never,
    );
    const send = jest
      .fn()
      .mockResolvedValue({ data: { id: 'provider-accepted' }, error: null });
    Object.defineProperty(service, 'resend', { value: { emails: { send } } });
    Object.defineProperty(service, 'smtpUser', { value: undefined });
    Object.defineProperty(service, 'smtpPass', { value: undefined });
    const options = {
      from: log.from,
      replyTo: log.replyTo,
      eventKey: 'reply-unique',
    };
    const dto = {
      to: log.to,
      subject: 'Changed template',
      text: 'Changed text',
      event: 'complaint_reply',
    };
    return { service, send, findOneAndUpdate, findByIdAndUpdate, options, dto };
  }

  it('uses the persisted payload, support reply-to and provider idempotency key on retries', async () => {
    const test = setup();
    await test.service.sendTransactional(test.dto, test.options);
    expect(test.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Support <support@bhi47.app>',
        replyTo: 'support@bhi47.app',
        subject: 'Original subject',
        text: 'Original text',
      }),
      { idempotencyKey: 'reply-unique' },
    );
    expect(test.findByIdAndUpdate).toHaveBeenCalledWith(expect.anything(), {
      $set: expect.objectContaining({
        status: 'sent',
        providerId: 'provider-accepted',
      }),
    });
  });
  it('does not resend an event already recorded as sent', async () => {
    const test = setup('sent');
    await test.service.sendTransactional(test.dto, test.options);
    expect(test.send).not.toHaveBeenCalled();
  });
  it('records failed provider acceptance and propagates failure to the outbox', async () => {
    const test = setup();
    test.send.mockResolvedValue({
      error: { message: 'delivery rejected' },
      data: null,
    });
    await expect(
      test.service.sendTransactional(test.dto, test.options),
    ).rejects.toThrow('delivery rejected');
    expect(test.findByIdAndUpdate).toHaveBeenCalledWith(expect.anything(), {
      $set: expect.objectContaining({ status: 'failed' }),
    });
  });
  it('rejects header injection before persisting or sending', async () => {
    const test = setup();
    await expect(
      test.service.sendTransactional(test.dto, {
        ...test.options,
        replyTo: 'support@bhi47.app\r\nBcc: x@example.com',
      }),
    ).rejects.toThrow();
    expect(test.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('includes the support sender and Reply-To in SMTP MIME headers', () => {
    const test = setup();
    const mime = test.service['buildMimeMessage']({
      emailLogId: 'log',
      to: ['student@example.com'],
      subject: 'Reply',
      text: 'Notice',
      from: test.options.from,
      replyTo: test.options.replyTo,
    });
    expect(mime).toContain('From: Support <support@bhi47.app>\r\n');
    expect(mime).toContain('Reply-To: support@bhi47.app\r\n');
  });
});
