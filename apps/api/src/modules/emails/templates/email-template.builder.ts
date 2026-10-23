function escapeHtml(value: string | undefined | null): string {
  if (!value) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Base Email Wrapper with High-Fidelity Institute Header & Official Footer */
function renderBaseEmailLayout({
  preheader,
  headerTitle,
  headerSubtitle,
  contentHtml,
  footerHtml,
  lang = 'ar',
  logoUrl,
}: {
  preheader: string;
  headerTitle: string;
  headerSubtitle?: string;
  contentHtml: string;
  footerHtml?: string;
  lang?: 'ar' | 'en';
  logoUrl?: string;
}) {
  const isAr = lang === 'ar';
  const safePreheader = escapeHtml(preheader);
  const safeHeaderTitle = escapeHtml(headerTitle);

  const defaultSubtitle = isAr
    ? 'بوابة الطالب الأكاديمية الرسمية'
    : 'Official Academic Student Portal';
  const safeHeaderSubtitle = escapeHtml(headerSubtitle || defaultSubtitle);

  const instituteName = isAr
    ? 'المعهد العالي للعلوم الإدارية المتقدمة والحاسبات'
    : 'Higher Institute for Advanced Administrative Sciences & Computer';

  const defaultFooter = isAr
    ? `
      <div style="font-weight:700;color:#334155;">المعهد العالي للعلوم الإدارية المتقدمة والحاسبات (BHI47A) &copy; ${new Date().getFullYear()}</div>
      <div style="margin-top:6px;color:#64748b;font-size:10px;line-height:1.5;">هذه الرسالة إلكترونية رسمية ومعتمدة من نظام البوابة الطلابية، يرجى عدم الرد المباشر على هذا البريد.</div>
    `
    : `
      <div style="font-weight:700;color:#334155;">Higher Institute for Advanced Administrative Sciences &amp; Computer (BHI47A) &copy; ${new Date().getFullYear()}</div>
      <div style="margin-top:6px;color:#64748b;font-size:10px;line-height:1.5;">This is an automated official email notification from the Student Portal system. Please do not reply directly.</div>
    `;

  return `<!DOCTYPE html>
<html lang="${isAr ? 'ar' : 'en'}" dir="${isAr ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>${safeHeaderTitle}</title>
  <style>@media screen and (max-width:480px){.email-body{padding:24px 18px!important}.email-header{padding:24px 18px!important}}</style>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#0f172a;">
  <!-- Preheader text hidden in client inbox list -->
  <div style="display:none;font-size:1px;color:#f1f5f9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${safePreheader}
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed;background-color:#f1f5f9;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed;max-width:580px;background-color:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(15,118,110,0.08);border:1px solid #e2e8f0;">
          <!-- Institute Header Banner -->
          <tr>
            <td class="email-header" style="background-color:#0f766e;background-image:linear-gradient(135deg,#115e59,#0d9488);padding:26px 24px;text-align:center;color:#ffffff;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <!-- Official Institute Emblem -->
                    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 12px;">
                      <tr>
                        <td align="center">
                          <img src="${escapeHtml(logoUrl || 'https://bhi47a-support.vercel.app/logo.png')}" alt="BHI47A" width="60" height="60" style="display:block;width:60px;height:60px;border-radius:50%;border:2px solid #ffffff;margin:0 auto;background-color:#0f766e;" />
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <div style="font-size:12px;font-weight:700;letter-spacing:0.04em;color:#ccfbf1;margin-bottom:6px;">
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
            <td class="email-body" style="padding:32px 30px;background-color:#ffffff;color:#0f172a;line-height:1.7;">
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
  copyCodeUrl?: string;
  logoUrl?: string;
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
  copyCodeUrl,
  logoUrl,
}: OtpTemplateInput): string {
  const isAr = lang === 'ar';
  const safeName = escapeHtml(greetingName);
  // Keep raw 6 digits without injected spaces so copying pastes exactly the code!
  const cleanOtp = escapeHtml(otp.trim());

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
    ? '⏱️ صالح للاستخدام لمدة 15 دقيقة فقط'
    : '⏱️ Valid for 15 minutes only';
  const copyHint = isAr
    ? 'اضغط مطولاً على الرمز أو حدده ثم اختر «نسخ».'
    : 'Press and hold, or select the code, then choose Copy.';

  const securityNotice = isAr
    ? '🛡️ <strong>تنبيه أمني هام:</strong> لا تشارك هذا الرمز السري مع أي شخص مطلقاً. إدارة المعهد لن تطلب منك هذا الرمز تحت أي ظرف. إذا لم تكن أنت صاحب هذا الطلب، يرجى تجاهل هذه الرسالة وتأمين حسابك فوراً.'
    : '🛡️ <strong>Important Security Notice:</strong> Never share this one-time code with anyone. Institute administrators will never request it. If you did not initiate this request, please disregard this email and secure your account immediately.';

  const contentHtml = `
    <div style="text-align:${isAr ? 'right' : 'left'};">
      <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0f172a;">
        ${isAr ? `مرحباً ${safeName}،` : `Hello ${safeName},`}
      </p>
      <p style="margin:0;font-size:13px;line-height:1.8;color:#334155;">
        ${safeBodyText}
      </p>
    </div>

    <!-- OTP Display Box (Clean, Copyable Code Block) -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:26px 0;">
      <tr>
        <td align="center">
          <div style="background-color:#f0fdfa;border:1px solid #99f6e4;border-radius:14px;padding:22px 12px;text-align:center;max-width:360px;">
            <div style="font-size:11px;font-weight:800;letter-spacing:0.12em;color:#0f766e;text-transform:uppercase;margin-bottom:10px;">
              ${otpHeader}
            </div>
            <div style="font-family:Consolas,'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:6px;color:#115e59;margin:8px 0;padding:16px 10px;background-color:#ffffff;border:1px solid #99f6e4;border-radius:10px;display:inline-block;user-select:all;-webkit-user-select:all;" dir="ltr">${cleanOtp}</div>
            <div style="font-size:10px;color:#64748b;margin-top:6px;">
              ${copyHint}
            </div>
            <div style="font-size:11px;color:#0d9488;font-weight:700;margin-top:8px;">
              ${otpExpiry}
            </div>
          </div>
        </td>
      </tr>
    </table>

    ${
      copyCodeUrl
        ? `<div style="text-align:center;margin:0 0 24px;">
      <a href="${escapeHtml(copyCodeUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#0f766e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 24px;border-radius:8px;">${isAr ? 'فتح صفحة نسخ الرمز' : 'Open code copier'}</a>
      <p style="font-size:12px;color:#64748b;margin:10px 0 0;">${isAr ? 'يفتح صفحة آمنة في المتصفح بها زر نسخ.' : 'Opens a secure browser page with a Copy button.'}</p>
    </div>`
        : ''
    }

    <!-- Security Warning -->
    <div style="margin-top:22px;padding:14px 18px;background-color:#f0fdfa;border-radius:10px;border-${isAr ? 'right' : 'left'}:4px solid #0d9488;text-align:${isAr ? 'right' : 'left'};">
      <div style="font-size:11px;color:#134e4a;line-height:1.6;">
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
    logoUrl,
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

  const codeLabel = isAr ? 'الكود الأكاديمي للطالب:' : 'Academic Student ID:';
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
              <div style="font-family:Consolas, monospace;font-size:18px;font-weight:800;color:#0f172a;margin-top:4px;background:#ffffff;padding:8px 12px;border-radius:8px;border:1px solid #ccfbf1;user-select:all;-webkit-user-select:all;" dir="ltr">
                ${safeCode}
              </div>
            </div>
            <div>
              <span style="font-size:11px;color:#0f766e;font-weight:700;text-transform:uppercase;">${passLabel}</span>
              <div style="font-family:Consolas, monospace;font-size:18px;font-weight:800;color:#0f766e;margin-top:4px;background:#ffffff;padding:8px 12px;border-radius:8px;border:1px solid #ccfbf1;user-select:all;-webkit-user-select:all;" dir="ltr">
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
