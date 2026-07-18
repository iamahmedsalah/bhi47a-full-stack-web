interface OtpTemplateInput {
  title: string;
  preheader: string;
  greetingName: string;
  arabicMessage: string;
  englishMessage: string;
  otp: string;
  footerNote?: string;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderOtpEmailTemplate({
  title,
  preheader,
  greetingName,
  arabicMessage,
  englishMessage,
  otp,
  footerNote = 'This code expires in 15 minutes.',
}: OtpTemplateInput) {
  const safeTitle = escapeHtml(title);
  const safePreheader = escapeHtml(preheader);
  const safeName = escapeHtml(greetingName);
  const safeArabicMessage = escapeHtml(arabicMessage);
  const safeEnglishMessage = escapeHtml(englishMessage);
  const safeOtp = escapeHtml(otp);
  const safeFooter = escapeHtml(footerNote);

  return `
    <div style="display:none;max-height:0;overflow:hidden;color:transparent;">${safePreheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#06232b;padding:28px 12px;font-family:Arial,Tahoma,sans-serif;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #dbeafe;">
            <tr>
              <td style="background:#0f766e;padding:24px;text-align:center;color:#ffffff;">
                <div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;opacity:.85;">Student Portal</div>
                <h1 style="margin:8px 0 0;font-size:22px;line-height:1.35;">${safeTitle}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 28px;">
                <div dir="rtl" style="text-align:right;color:#0f172a;">
                  <p style="margin:0 0 10px;font-size:16px;line-height:1.7;">مرحباً <strong>${safeName}</strong>،</p>
                  <p style="margin:0 0 18px;font-size:14px;line-height:1.8;color:#475569;">${safeArabicMessage}</p>
                </div>
                <div style="margin:22px auto;padding:18px;border-radius:14px;background:#ecfeff;border:1px solid #99f6e4;text-align:center;">
                  <div style="font-size:11px;color:#0f766e;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">Verification Code</div>
                  <div style="font-family:Consolas,Menlo,monospace;font-size:32px;font-weight:800;letter-spacing:8px;color:#0f172a;margin-top:6px;">${safeOtp}</div>
                </div>
                <div dir="ltr" style="text-align:left;color:#0f172a;">
                  <p style="margin:0 0 10px;font-size:16px;line-height:1.7;">Hello <strong>${safeName}</strong>,</p>
                  <p style="margin:0;font-size:14px;line-height:1.8;color:#475569;">${safeEnglishMessage}</p>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f8fafc;color:#64748b;font-size:12px;line-height:1.7;text-align:center;">
                ${safeFooter}<br />
                If you did not request this, you can safely ignore this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}
