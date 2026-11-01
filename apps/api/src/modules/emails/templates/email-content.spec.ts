import {
  brandedEmailSender,
  buildOtpEmail,
  buildComplaintReplyEmail,
  getEmailPortalOrigin,
  resolveEmailLanguage,
} from './email-content';

describe('localized authentication emails', () => {
  it.each([
    ['en-US,en;q=0.9,ar;q=0.8', 'en'],
    ['ar-EG,en;q=0.8', 'ar'],
    ['fr,ar;q=0.2,en;q=0.9', 'en'],
    ['en;q=0,ar;q=1', 'ar'],
    [undefined, 'ar'],
  ])('resolves request language %s', (header, expected) => {
    expect(resolveEmailLanguage(header)).toBe(expected);
  });

  it.each(['google-link', 'password-reset', 'verification'] as const)(
    'keeps %s email subject, direction, body and copy link in the requested language',
    (purpose) => {
      for (const lang of ['ar', 'en'] as const) {
        const email = buildOtpEmail({
          purpose,
          lang,
          greetingName: '<Student>',
          otp: '012345',
          portalUrl: 'https://portal.example.edu',
        });
        expect(email.subject).toContain(
          lang === 'ar' ? 'بوابة الطالب' : 'Student Portal',
        );
        expect(email.subject).not.toContain('012345');
        expect(email.html).toContain(
          `lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"`,
        );
        expect(email.html).toContain('&lt;Student&gt;');
        expect(email.html).toContain('>012345</div>');
        expect(email.html).toContain(
          `/email-code.html#lang=${lang}&amp;code=012345`,
        );
        expect(email.text.split('\n')[0]).toContain('012345');
        expect(email.html.indexOf('012345')).toBeLessThan(
          email.html.indexOf('<table'),
        );
        expect(email.html).not.toMatch(/<script|onclick=|javascript:/i);
      }
    },
  );

  it('does not generate OTP links to unsafe or missing portal origins', () => {
    expect(getEmailPortalOrigin('javascript:alert(1)')).toBeUndefined();
    expect(
      getEmailPortalOrigin('https://user:secret@portal.example.edu'),
    ).toBeUndefined();
    expect(
      buildOtpEmail({
        purpose: 'verification',
        lang: 'en',
        greetingName: 'Student',
        otp: '012345',
      }).html,
    ).not.toContain('email-code.html');
    expect(getEmailPortalOrigin('http://localhost:3000/ar')).toBe(
      'http://localhost:3000',
    );
  });

  it('brands bare sender addresses while retaining configured verified mailboxes', () => {
    expect(brandedEmailSender('onboarding@resend.dev')).toBe(
      '"BHI47A Student Portal" <onboarding@resend.dev>',
    );
    expect(brandedEmailSender('Institute <verified@example.edu>')).toBe(
      'Institute <verified@example.edu>',
    );
    expect(brandedEmailSender('onboarding@resend.dev', 'بوابة الطالب')).toBe(
      '"بوابة الطالب" <onboarding@resend.dev>',
    );
  });
});

describe('complaint reply emails', () => {
  it.each(['ar', 'en'] as const)(
    'uses %s and a ticket-only link without a login bypass',
    (lang) => {
      const email = buildComplaintReplyEmail({
        ticketNumber: 'TKT-20261101-1234',
        lang,
        portalUrl: 'https://bhi47.app',
      });
      expect(email.subject).toContain('TKT-20261101-1234');
      const link = email.text
        .split('\n')
        .find((line) => line.startsWith('https:'))!;
      const url = new URL(link);
      expect(url.pathname).toBe(`/${lang}/complaints`);
      expect([...url.searchParams.keys()]).toEqual(['tab', 'ticket']);
      expect(email.html).toContain(`dir="${lang === 'ar' ? 'rtl' : 'ltr'}"`);
      expect(email.html).not.toMatch(/<script|nationalId|studentCode|token=/i);
    },
  );
  it('rejects unsafe portal origins and escapes ticket text', () => {
    expect(() =>
      buildComplaintReplyEmail({
        ticketNumber: 'T',
        lang: 'en',
        portalUrl: 'javascript:alert(1)',
      }),
    ).toThrow();
    const email = buildComplaintReplyEmail({
      ticketNumber: '<img src=x>',
      lang: 'en',
      portalUrl: 'https://bhi47.app',
    });
    expect(email.html).toContain('&lt;img src=x&gt;');
    expect(email.html).not.toContain('<img src=x>');
  });
});
