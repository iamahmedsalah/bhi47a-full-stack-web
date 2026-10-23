import { renderOtpEmailTemplate } from './email-template.builder';

export type EmailLanguage = 'ar' | 'en';

/** Use the request language, including weighted browser Accept-Language headers. */
export function resolveEmailLanguage(header?: string): EmailLanguage {
  const preferred = (header ?? '')
    .split(',')
    .map((entry) => {
      const [tag, ...parameters] = entry.trim().toLowerCase().split(';');
      const quality = parameters.find((part) => part.trim().startsWith('q='));
      const q = quality ? Number(quality.trim().slice(2)) : 1;
      return { language: tag.split('-')[0], q };
    })
    .filter(
      ({ language, q }) =>
        (language === 'ar' || language === 'en') &&
        Number.isFinite(q) &&
        q > 0 &&
        q <= 1,
    )
    .sort((a, b) => b.q - a.q);
  return preferred[0]?.language === 'en' ? 'en' : 'ar';
}

export function getEmailPortalOrigin(configured?: string): string | undefined {
  try {
    const url = new URL(configured ?? '');
    if (
      url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(url.hostname)
      )
    )
      return undefined;
    if (url.username || url.password) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

const otpCopy = {
  verification: {
    ar: {
      title: 'تأكيد حسابك',
      message: 'استخدم رمز التحقق التالي لتأكيد حسابك في بوابة الطالب.',
    },
    en: {
      title: 'Verify your account',
      message:
        'Use this verification code to confirm your Student Portal account.',
    },
  },
  'google-link': {
    ar: {
      title: 'تأكيد ربط حساب Google',
      message:
        'طلبت ربط حساب Google ببوابة الطالب. أدخل الرمز التالي في صفحة الملف الشخصي لإتمام الربط.',
    },
    en: {
      title: 'Verify your Google account link',
      message:
        'You requested to link Google to your Student Portal account. Enter this code on your Profile page to finish linking.',
    },
  },
  'password-reset': {
    ar: {
      title: 'رمز إعادة تعيين كلمة المرور',
      message:
        'طلبت استعادة الوصول إلى حسابك. أدخل الرمز التالي في صفحة استعادة كلمة المرور للمتابعة.',
    },
    en: {
      title: 'Your password reset code',
      message:
        'You requested to recover access to your account. Enter this code on the password recovery page to continue.',
    },
  },
} as const;

/** Add future OTP purposes here so subjects, previews and bodies stay consistent. */
export function buildOtpEmail(input: {
  purpose: keyof typeof otpCopy;
  lang: EmailLanguage;
  greetingName: string;
  otp: string;
  portalUrl?: string;
}) {
  const { title, message } = otpCopy[input.purpose][input.lang];
  const isAr = input.lang === 'ar';
  const subject = `${title} | ${isAr ? 'بوابة الطالب BHI47A' : 'BHI47A Student Portal'}`;
  const preheader = isAr
    ? 'صالح لمدة 15 دقيقة. لا تشارك هذا الرمز مع أي شخص.'
    : 'Valid for 15 minutes. Never share this code with anyone.';
  const origin = getEmailPortalOrigin(input.portalUrl);
  // Fragments are not sent to the web server; the copy page immediately clears it.
  const copyCodeUrl =
    origin && /^\d{6}$/.test(input.otp)
      ? `${origin}/email-code.html#${new URLSearchParams({ lang: input.lang, code: input.otp })}`
      : undefined;
  return {
    subject,
    text: `${title}\n\n${message}\n\n${input.otp}\n\n${preheader}`,
    html: renderOtpEmailTemplate({
      ...input,
      title,
      message,
      preheader,
      copyCodeUrl,
      logoUrl: origin ? `${origin}/logo.png` : undefined,
    }),
  };
}

export function brandedEmailSender(
  address: string,
  displayName?: string,
): string {
  const cleanAddress = address.replace(/[\r\n]/g, '').trim();
  if (!displayName && cleanAddress.includes('<')) return cleanAddress;
  const mailbox = cleanAddress.match(/<([^>]+)>/)?.[1] ?? cleanAddress;
  const name = (displayName || 'BHI47A Student Portal')
    .replace(/[\r\n<>"\\]/g, '')
    .trim();
  return `"${name}" <${mailbox}>`;
}
