const INSTITUTE_LOGO_URL =
  'https://res.cloudinary.com/dkocrxpu4/image/upload/w_160,h_160,c_limit,f_auto,q_auto/v1770685642/logo_k8bbtk.webp';

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
  headerSubtitle = 'بوابة الطالب الإلكترونية | Student Portal',
  contentHtml,
  footerHtml,
}: {
  preheader: string;
  headerTitle: string;
  headerSubtitle?: string;
  contentHtml: string;
  footerHtml?: string;
}) {
  const safePreheader = escapeHtml(preheader);
  const safeHeaderTitle = escapeHtml(headerTitle);
  const safeHeaderSubtitle = escapeHtml(headerSubtitle);

  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeHeaderTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#06232b;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;-webkit-font-smoothing:antialiased;">
  <!-- Preheader text hidden in client inbox list -->
  <div style="display:none;font-size:1px;color:#06232b;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${safePreheader}
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#06232b;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.3);border:1px solid #134e4a;">
          <!-- Institute Header Banner -->
          <tr>
            <td style="background:linear-gradient(135deg, #05262e 0%, #0f766e 100%);padding:28px 24px;text-align:center;color:#ffffff;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <img src="${INSTITUTE_LOGO_URL}" alt="شعار المعهد" width="68" height="68" style="display:block;margin:0 auto 12px;border-radius:10px;object-fit:contain;" />
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;color:#99f6e4;text-transform:uppercase;margin-bottom:4px;">
                      المعهد العالي للعلوم الإدارية المتقدمة والحاسبات
                    </div>
                    <div style="font-size:10px;color:#cbd5e1;letter-spacing:0.05em;margin-bottom:12px;">
                      Higher Institute for Advanced Administrative Sciences &amp; Computer
                    </div>
                    <h1 style="margin:0;font-size:20px;font-weight:800;color:#ffffff;line-height:1.4;">
                      ${safeHeaderTitle}
                    </h1>
                    <div style="margin-top:6px;font-size:11px;color:#a7f3d0;font-weight:600;">
                      ${safeHeaderSubtitle}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Email Content Body -->
          <tr>
            <td style="padding:28px 30px;background-color:#ffffff;color:#1e293b;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Official Institute Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:20px 24px;border-top:1px solid #e2e8f0;text-align:center;color:#64748b;font-size:11px;line-height:1.6;">
              ${
                footerHtml ||
                `
                <div>المعهد العالي للعلوم الإدارية المتقدمة والحاسبات &copy; ${new Date().getFullYear()}</div>
                <div style="margin-top:4px;color:#94a3b8;">هذه الرسالة آلية من نظام البوابة الطلابية، يرجى عدم الرد المباشر عليها.</div>
              `
              }
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// ─── 1. OTP Verification Email Template ─────────────────────────────────

export interface OtpTemplateInput {
  title: string;
  preheader: string;
  greetingName: string;
  arabicMessage: string;
  englishMessage: string;
  otp: string;
  footerNote?: string;
}

export function renderOtpEmailTemplate({
  title,
  preheader,
  greetingName,
  arabicMessage,
  englishMessage,
  otp,
  footerNote = 'هذا الرمز صالح لمدة 15 دقيقة فقط. | This verification code expires in 15 minutes.',
}: OtpTemplateInput): string {
  const safeName = escapeHtml(greetingName);
  const safeArabicMessage = escapeHtml(arabicMessage);
  const safeEnglishMessage = escapeHtml(englishMessage);
  const safeOtp = escapeHtml(otp.split('').join(' ')); // e.g. "5 2 2 5 4 0"
  const safeFooterNote = escapeHtml(footerNote);

  const contentHtml = `
    <!-- Arabic Section (RTL) -->
    <div dir="rtl" style="text-align:right;margin-bottom:20px;">
      <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#0f172a;">
        مرحباً ${safeName}،
      </p>
      <p style="margin:0;font-size:13px;line-height:1.8;color:#334155;">
        ${safeArabicMessage}
      </p>
    </div>

    <!-- OTP Display Box -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;">
      <tr>
        <td align="center">
          <div style="background-color:#ecfeff;border:2px dashed #0d9488;border-radius:14px;padding:20px 24px;text-align:center;max-width:320px;">
            <div style="font-size:11px;font-weight:800;letter-spacing:0.12em;color:#0f766e;text-transform:uppercase;margin-bottom:6px;">
              رمز التحقق | VERIFICATION CODE
            </div>
            <div style="font-family:Consolas, 'Courier New', monospace;font-size:32px;font-weight:900;letter-spacing:10px;color:#0f2e35;margin:8px 0;text-shadow:0 1px 2px rgba(0,0,0,0.1);">
              ${safeOtp}
            </div>
            <div style="font-size:11px;color:#0f766e;font-weight:600;margin-top:6px;">
              ⏱️ صالح لمدة 15 دقيقة فقط
            </div>
          </div>
        </td>
      </tr>
    </table>

    <!-- English Section (LTR) -->
    <div dir="ltr" style="text-align:left;margin-top:20px;padding-top:16px;border-top:1px solid #f1f5f9;">
      <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#0f172a;">
        Hello ${safeName},
      </p>
      <p style="margin:0;font-size:13px;line-height:1.8;color:#475569;">
        ${safeEnglishMessage}
      </p>
    </div>

    <!-- Security Warning -->
    <div style="margin-top:24px;padding:12px 16px;background-color:#fef2f2;border-radius:10px;border-left:4px solid #ef4444;text-align:start;">
      <div style="font-size:11px;color:#991b1b;line-height:1.6;">
        🛡️ <strong>تنبيه أمني / Security Notice:</strong> لا تشارك هذا الرمز مع أي شخص. موظفو المعهد لن يطلبوا رمزك السري إطلاقاً. إذا لم تطلب هذا الرمز، يرجى تجاهل الرسالة وتأمين حسابك.
      </div>
    </div>
  `;

  return renderBaseEmailLayout({
    preheader,
    headerTitle: title,
    headerSubtitle: 'رمز التحقق السريع | One-Time Password',
    contentHtml,
    footerHtml: `
      <div>${safeFooterNote}</div>
      <div style="margin-top:6px;font-size:10px;color:#94a3b8;">
        المعهد العالي للعلوم الإدارية المتقدمة والحاسبات &copy; ${new Date().getFullYear()}
      </div>
    `,
  });
}

// ─── 2. Password Reset Email Template ───────────────────────────────────

export interface PasswordResetTemplateInput {
  greetingName: string;
  studentCode: string;
  temporaryPassword: string;
  loginUrl?: string;
}

export function renderPasswordResetEmailTemplate({
  greetingName,
  studentCode,
  temporaryPassword,
  loginUrl = 'http://localhost:3000/ar/login',
}: PasswordResetTemplateInput): string {
  const safeName = escapeHtml(greetingName);
  const safeCode = escapeHtml(studentCode);
  const safePassword = escapeHtml(temporaryPassword);

  const contentHtml = `
    <!-- Arabic Notice (RTL) -->
    <div dir="rtl" style="text-align:right;margin-bottom:20px;">
      <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#0f172a;">
        مرحباً ${safeName}،
      </p>
      <p style="margin:0 0 12px;font-size:13px;line-height:1.8;color:#334155;">
        تمت إعادة تعيين كلمة المرور الخاصة بحسابك في بوابة الطالب بنجاح بواسطة إدارة شؤون الطلاب. يمكنك استخدام البيانات التالية لتسجيل الدخول:
      </p>
    </div>

    <!-- Credentials Card -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;">
      <tr>
        <td align="center">
          <div style="background-color:#f0fdfa;border:1px solid #99f6e4;border-radius:14px;padding:20px 24px;text-align:start;max-width:380px;">
            <div style="margin-bottom:12px;">
              <span style="font-size:11px;color:#0f766e;font-weight:700;text-transform:uppercase;">الكود الأكاديمي / Student Code:</span>
              <div style="font-family:Consolas, monospace;font-size:18px;font-weight:800;color:#0f172a;margin-top:4px;background:#ffffff;padding:6px 12px;border-radius:8px;border:1px solid #ccfbf1;" dir="ltr">
                ${safeCode}
              </div>
            </div>
            <div>
              <span style="font-size:11px;color:#0f766e;font-weight:700;text-transform:uppercase;">كلمة المرور المؤقتة / Temporary Password:</span>
              <div style="font-family:Consolas, monospace;font-size:18px;font-weight:800;color:#0f766e;margin-top:4px;background:#ffffff;padding:6px 12px;border-radius:8px;border:1px solid #ccfbf1;" dir="ltr">
                ${safePassword}
              </div>
            </div>
          </div>
        </td>
      </tr>
    </table>

    <!-- English Notice (LTR) -->
    <div dir="ltr" style="text-align:left;margin-top:16px;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#334155;">
        Your password has been reset by the administration.
      </p>
      <p style="margin:0;font-size:12px;color:#64748b;line-height:1.6;">
        You will be required to choose a new secure password upon your first sign-in.
      </p>
    </div>

    <!-- CTA Button -->
    <div style="text-align:center;margin:28px 0 16px;">
      <a href="${loginUrl}" target="_blank" style="display:inline-block;background-color:#0f766e;color:#ffffff;font-size:13px;font-weight:700;padding:12px 28px;border-radius:10px;text-decoration:none;box-shadow:0 4px 10px rgba(15,118,110,0.3);">
        تسجيل الدخول إلى البوابة | Login to Portal
      </a>
    </div>

    <!-- Security Warning -->
    <div style="margin-top:20px;padding:12px 16px;background-color:#fffbeb;border-radius:10px;border-left:4px solid #f59e0b;text-align:start;">
      <div style="font-size:11px;color:#92400e;line-height:1.6;">
        ⚠️ <strong>ملاحظة هامة:</strong> يتطلب النظام تعيين كلمة مرور جديدة قوية فور تسجيل الدخول لضمان أمان حسابك وسجلاتك الأكاديمية.
      </div>
    </div>
  `;

  return renderBaseEmailLayout({
    preheader: `تمت إعادة تعيين كلمة المرور لحسابك في البوابة (${studentCode})`,
    headerTitle: 'إعادة تعيين كلمة المرور | Password Reset',
    headerSubtitle: 'بيانات الدخول الأكاديمية | Account Credentials',
    contentHtml,
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
}

export function renderNotificationAlertEmailTemplate({
  title,
  body,
  categoryLabel = 'تنبيه أكاديمي رسمي',
  greetingName = 'عزيزي الطالب / عزيزتي الطالبة',
  portalActionUrl,
  portalActionLabel = 'عرض التفاصيل بالبوابة',
}: NotificationAlertTemplateInput): string {
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body);
  const safeCategory = escapeHtml(categoryLabel);
  const safeName = escapeHtml(greetingName);

  const contentHtml = `
    <div dir="rtl" style="text-align:right;">
      <div style="display:inline-block;background-color:#ecfeff;border:1px solid #99f6e4;color:#0f766e;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;margin-bottom:12px;">
        📢 ${safeCategory}
      </div>

      <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0f172a;">
        مرحباً ${safeName}،
      </p>

      <div style="background-color:#f8fafc;border-right:4px solid #0f766e;border-radius:10px;padding:18px 20px;margin:16px 0;">
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
        <a href="${portalActionUrl}" target="_blank" style="display:inline-block;background-color:#0f766e;color:#ffffff;font-size:13px;font-weight:700;padding:12px 28px;border-radius:10px;text-decoration:none;box-shadow:0 4px 10px rgba(15,118,110,0.3);">
          ${escapeHtml(portalActionLabel)}
        </a>
      </div>
    `
        : ''
    }
  `;

  return renderBaseEmailLayout({
    preheader: title,
    headerTitle: 'إشعار أكاديمي هام | Academic Notice',
    headerSubtitle: 'إدارة شؤون الطلاب والامتحانات',
    contentHtml,
  });
}
