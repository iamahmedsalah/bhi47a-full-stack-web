const INSTITUTE_LOGO_URL =
  'https://res.cloudinary.com/dkocrxpu4/image/upload/w_160,h_160,c_limit/v1770685642/logo_k8bbtk.png';

function escapeHtml(value: string | undefined | null): string {
  if (!value) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Base Email Wrapper with Institute Header & Official Footer */
function renderBaseEmailLayout({
  preheader,
  headerTitle,
  headerSubtitle,
  contentHtml,
  footerHtml,
  lang = 'ar',
}: {
  preheader: string;
  headerTitle: string;
  headerSubtitle?: string;
  contentHtml: string;
  footerHtml?: string;
  lang?: 'ar' | 'en';
}) {
  const isAr = lang === 'ar';
  const safePreheader = escapeHtml(preheader);
  const safeHeaderTitle = escapeHtml(headerTitle);

  const defaultSubtitle = isAr
    ? 'بوابة الطالب الإلكترونية الرسمية'
    : 'Official Student Portal';
  const safeHeaderSubtitle = escapeHtml(headerSubtitle || defaultSubtitle);

  const instituteName = isAr
    ? 'المعهد العالي للعلوم الإدارية المتقدمة والحاسبات'
    : 'Higher Institute for Advanced Administrative Sciences & Computer';

  const defaultFooter = isAr
    ? `
      <div>المعهد العالي للعلوم الإدارية المتقدمة والحاسبات &copy; ${new Date().getFullYear()}</div>
      <div style="margin-top:6px;color:#94a3b8;font-size:10px;">هذه الرسالة رسمية وآلية من نظام البوابة الطلابية، يرجى عدم الرد المباشر عليها.</div>
    `
    : `
      <div>Higher Institute for Advanced Administrative Sciences &amp; Computer &copy; ${new Date().getFullYear()}</div>
      <div style="margin-top:6px;color:#94a3b8;font-size:10px;">This is an automated official email from the Student Portal system. Please do not reply directly.</div>
    `;

  return `<!DOCTYPE html>
<html lang="${isAr ? 'ar' : 'en'}" dir="${isAr ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>${safeHeaderTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#04262f;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#0f172a;">
  <!-- Preheader text hidden in client inbox list -->
  <div style="display:none;font-size:1px;color:#04262f;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${safePreheader}
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#04262f;padding:36px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background-color:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,0.35);border:1px solid #0f766e;">
          <!-- Institute Header Banner -->
          <tr>
            <td style="background-color:#063b46;background:linear-gradient(135deg, #04262f 0%, #064e5b 55%, #0f766e 100%);padding:32px 24px;text-align:center;color:#ffffff;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <img src="${INSTITUTE_LOGO_URL}" alt="${isAr ? 'شعار المعهد' : 'Institute Logo'}" width="64" height="64" style="display:block;margin:0 auto 12px;border-radius:12px;object-fit:contain;background-color:rgba(255,255,255,0.08);padding:4px;" />
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <div style="font-size:12px;font-weight:700;letter-spacing:0.04em;color:#99f6e4;margin-bottom:6px;">
                      ${instituteName}
                    </div>
                    <h1 style="margin:0 0 6px 0;font-size:20px;font-weight:800;color:#ffffff;line-height:1.4;">
                      ${safeHeaderTitle}
                    </h1>
                    <div style="font-size:11px;color:#a7f3d0;font-weight:600;">
                      ${safeHeaderSubtitle}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Email Content Body -->
          <tr>
            <td style="padding:32px 30px;background-color:#ffffff;color:#0f172a;line-height:1.7;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Official Institute Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:22px 24px;border-top:1px solid #e2e8f0;text-align:center;color:#64748b;font-size:11px;line-height:1.6;">
              ${footerHtml || defaultFooter}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── 1. OTP Verification Email Template ─────────────────────────────────

export interface OtpTemplateInput {
  title?: string;
  preheader?: string;
  greetingName: string;
  arabicMessage?: string;
  englishMessage?: string;
  message?: string;
  otp: string;
  footerNote?: string;
  lang?: 'ar' | 'en';
}

export function renderOtpEmailTemplate({
  title,
  preheader,
  greetingName,
  arabicMessage,
  englishMessage,
  message,
  otp,
  footerNote,
  lang = 'ar',
}: OtpTemplateInput): string {
  const isAr = lang === 'ar';
  const safeName = escapeHtml(greetingName);
  const safeOtp = escapeHtml(otp.split('').join(' ')); // e.g. "5 2 2 5 4 0"

  const defaultTitle = isAr
    ? 'رمز التحقق من الحساب'
    : 'Account Verification Code';
  const finalTitle = title || defaultTitle;

  const defaultPreheader = isAr
    ? 'استخدم رمز التحقق لتأكيد حسابك في بوابة الطالب'
    : 'Use your verification code to confirm your Student Portal account';
  const finalPreheader = preheader || defaultPreheader;

  const bodyText = isAr
    ? arabicMessage ||
      message ||
      'لقد تم طلب رمز تحقق لحسابك في بوابة الطالب. استخدم الرمز التالي لإكمال العملية:'
    : englishMessage ||
      message ||
      'You requested a verification code for your Student Portal account. Use the code below to complete your request:';

  const safeBodyText = escapeHtml(bodyText);

  const otpHeader = isAr ? 'رمز التحقق السريع' : 'VERIFICATION CODE';
  const otpExpiry = isAr
    ? '⏱️ صالح لمدة 15 دقيقة فقط'
    : '⏱️ Valid for 15 minutes only';

  const securityNotice = isAr
    ? '🛡️ <strong>تنبيه أمني هام:</strong> لا تشارك هذا الرمز السري مع أي شخص. موظفو إدارة المعهد لن يطلبوا هذا الرمز نهائياً. إذا لم تقم بطلب هذا الرمز، يرجى تجاهل الرسالة وتأمين حسابك.'
    : '🛡️ <strong>Important Security Notice:</strong> Never share this verification code with anyone. Institute staff will never request your code. If you did not initiate this request, please disregard this email and secure your account.';

  const contentHtml = `
    <div style="text-align:${isAr ? 'right' : 'left'};">
      <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0f172a;">
        ${isAr ? `مرحباً ${safeName}،` : `Hello ${safeName},`}
      </p>
      <p style="margin:0;font-size:13px;line-height:1.8;color:#334155;">
        ${safeBodyText}
      </p>
    </div>

    <!-- OTP Display Box -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:26px 0;">
      <tr>
        <td align="center">
          <div style="background-color:#f0fdfa;border:2px dashed #0d9488;border-radius:14px;padding:22px 24px;text-align:center;max-width:320px;">
            <div style="font-size:11px;font-weight:800;letter-spacing:0.12em;color:#0f766e;text-transform:uppercase;margin-bottom:8px;">
              ${otpHeader}
            </div>
            <div style="font-family:Consolas, 'Courier New', monospace;font-size:32px;font-weight:900;letter-spacing:8px;color:#042f2e;margin:6px 0;text-shadow:0 1px 1px rgba(0,0,0,0.05);" dir="ltr">
              ${safeOtp}
            </div>
            <div style="font-size:11px;color:#0d9488;font-weight:600;margin-top:8px;">
              ${otpExpiry}
            </div>
          </div>
        </td>
      </tr>
    </table>

    <!-- Security Warning -->
    <div style="margin-top:22px;padding:14px 18px;background-color:#fff7ed;border-radius:10px;border-${isAr ? 'right' : 'left'}:4px solid #f97316;text-align:${isAr ? 'right' : 'left'};">
      <div style="font-size:11px;color:#9a3412;line-height:1.6;">
        ${securityNotice}
      </div>
    </div>
  `;

  return renderBaseEmailLayout({
    preheader: finalPreheader,
    headerTitle: finalTitle,
    headerSubtitle: isAr
      ? 'رمز التحقق السريع (OTP)'
      : 'One-Time Verification Code (OTP)',
    contentHtml,
    footerHtml: footerNote ? `<div>${escapeHtml(footerNote)}</div>` : undefined,
    lang,
  });
}

// ─── 2. Password Reset Email Template ───────────────────────────────────

export interface PasswordResetTemplateInput {
  greetingName: string;
  studentCode: string;
  temporaryPassword: string;
  loginUrl?: string;
  lang?: 'ar' | 'en';
}

export function renderPasswordResetEmailTemplate({
  greetingName,
  studentCode,
  temporaryPassword,
  loginUrl = 'https://bhi47a-support.vercel.app/ar/login',
  lang = 'ar',
}: PasswordResetTemplateInput): string {
  const isAr = lang === 'ar';
  const safeName = escapeHtml(greetingName);
  const safeCode = escapeHtml(studentCode);
  const safePassword = escapeHtml(temporaryPassword);

  const preheader = isAr
    ? `تمت إعادة تعيين كلمة المرور لحسابك في البوابة (${studentCode})`
    : `Your Student Portal account password has been reset (${studentCode})`;

  const headerTitle = isAr
    ? 'إعادة تعيين كلمة المرور'
    : 'Password Reset Confirmation';

  const headerSubtitle = isAr
    ? 'بيانات الدخول الأكاديمية الرسمية'
    : 'Official Academic Login Credentials';

  const codeLabel = isAr ? 'الكود الأكاديمي للطلب:' : 'Student Academic Code:';
  const passLabel = isAr ? 'كلمة المرور المؤقتة:' : 'Temporary Password:';
  const buttonLabel = isAr
    ? 'تسجيل الدخول إلى البوابة'
    : 'Sign In to Student Portal';

  const introText = isAr
    ? 'تمت إعادة تعيين كلمة المرور الخاصة بحسابك في بوابة الطالب بنجاح بواسطة إدارة شؤون الطلاب. يمكنك استخدام البيانات التالية لتسجيل الدخول:'
    : 'Your Student Portal account password has been successfully reset by the Student Affairs administration. Use the credentials below to sign in:';

  const securityWarning = isAr
    ? '⚠️ <strong>ملاحظة هامة:</strong> يتطلب منك النظام تعيين كلمة مرور جديدة قوية فور تسجيل الدخول لضمان أمان حسابك وسجلاتك الأكاديمية.'
    : '⚠️ <strong>Important Security Notice:</strong> The system will prompt you to set a new strong password immediately upon your first sign-in.';

  const contentHtml = `
    <div style="text-align:${isAr ? 'right' : 'left'};">
      <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#0f172a;">
        ${isAr ? `مرحباً ${safeName}،` : `Hello ${safeName},`}
      </p>
      <p style="margin:0 0 12px;font-size:13px;line-height:1.8;color:#334155;">
        ${introText}
      </p>
    </div>

    <!-- Credentials Card -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;">
      <tr>
        <td align="center">
          <div style="background-color:#f0fdfa;border:1px solid #99f6e4;border-radius:14px;padding:20px 24px;text-align:${isAr ? 'right' : 'left'};max-width:380px;">
            <div style="margin-bottom:12px;">
              <span style="font-size:11px;color:#0f766e;font-weight:700;text-transform:uppercase;">${codeLabel}</span>
              <div style="font-family:Consolas, monospace;font-size:18px;font-weight:800;color:#0f172a;margin-top:4px;background:#ffffff;padding:8px 12px;border-radius:8px;border:1px solid #ccfbf1;" dir="ltr">
                ${safeCode}
              </div>
            </div>
            <div>
              <span style="font-size:11px;color:#0f766e;font-weight:700;text-transform:uppercase;">${passLabel}</span>
              <div style="font-family:Consolas, monospace;font-size:18px;font-weight:800;color:#0f766e;margin-top:4px;background:#ffffff;padding:8px 12px;border-radius:8px;border:1px solid #ccfbf1;" dir="ltr">
                ${safePassword}
              </div>
            </div>
          </div>
        </td>
      </tr>
    </table>

    <!-- CTA Button -->
    <div style="text-align:center;margin:28px 0 18px;">
      <a href="${loginUrl}" target="_blank" style="display:inline-block;background-color:#0d9488;color:#ffffff;font-size:13px;font-weight:700;padding:12px 30px;border-radius:10px;text-decoration:none;box-shadow:0 4px 12px rgba(13,148,136,0.35);">
        ${buttonLabel}
      </a>
    </div>

    <!-- Security Warning -->
    <div style="margin-top:20px;padding:12px 16px;background-color:#fffbeb;border-radius:10px;border-${isAr ? 'right' : 'left'}:4px solid #f59e0b;text-align:${isAr ? 'right' : 'left'};">
      <div style="font-size:11px;color:#92400e;line-height:1.6;">
        ${securityWarning}
      </div>
    </div>
  `;

  return renderBaseEmailLayout({
    preheader,
    headerTitle,
    headerSubtitle,
    contentHtml,
    lang,
  });
}

// ─── 3. Academic Notice / Alert Email Template ──────────────────────────

export interface NotificationAlertTemplateInput {
  title: string;
  body: string;
  categoryLabel?: string;
  greetingName?: string;
  portalActionUrl?: string;
  portalActionLabel?: string;
  lang?: 'ar' | 'en';
}

export function renderNotificationAlertEmailTemplate({
  title,
  body,
  categoryLabel,
  greetingName,
  portalActionUrl,
  portalActionLabel,
  lang = 'ar',
}: NotificationAlertTemplateInput): string {
  const isAr = lang === 'ar';
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body);
  const defaultCategory = isAr
    ? 'تنبيه أكاديمي رسمي'
    : 'Official Academic Notice';
  const safeCategory = escapeHtml(categoryLabel || defaultCategory);
  const defaultGreeting = isAr
    ? 'عزيزي الطالب / عزيزتي الطالبة'
    : 'Dear Student';
  const safeName = escapeHtml(greetingName || defaultGreeting);
  const defaultAction = isAr
    ? 'عرض التفاصيل بالبوابة'
    : 'View Details on Portal';
  const safeAction = escapeHtml(portalActionLabel || defaultAction);

  const contentHtml = `
    <div style="text-align:${isAr ? 'right' : 'left'};">
      <div style="display:inline-block;background-color:#f0fdfa;border:1px solid #99f6e4;color:#0f766e;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;margin-bottom:12px;">
        📢 ${safeCategory}
      </div>

      <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0f172a;">
        ${isAr ? `مرحباً ${safeName}،` : `Hello ${safeName},`}
      </p>

      <div style="background-color:#f8fafc;border-${isAr ? 'right' : 'left'}:4px solid #0d9488;border-radius:10px;padding:18px 20px;margin:16px 0;">
        <h2 style="margin:0 0 10px;font-size:16px;font-weight:800;color:#0f172a;line-height:1.5;">
          ${safeTitle}
        </h2>
        <div style="font-size:13px;line-height:1.8;color:#334155;white-space:pre-wrap;">
          ${safeBody}
        </div>
      </div>
    </div>

    ${
      portalActionUrl
        ? `
      <div style="text-align:center;margin:28px 0 10px;">
        <a href="${portalActionUrl}" target="_blank" style="display:inline-block;background-color:#0d9488;color:#ffffff;font-size:13px;font-weight:700;padding:12px 28px;border-radius:10px;text-decoration:none;box-shadow:0 4px 10px rgba(13,148,136,0.3);">
          ${safeAction}
        </a>
      </div>
    `
        : ''
    }
  `;

  return renderBaseEmailLayout({
    preheader: title,
    headerTitle: isAr ? 'إشعار أكاديمي هام' : 'Important Academic Notice',
    headerSubtitle: isAr
      ? 'إدارة شؤون الطلاب والامتحانات'
      : 'Student Affairs & Examination Office',
    contentHtml,
    lang,
  });
}
