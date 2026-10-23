(() => {
  'use strict';
  const parameters = new URLSearchParams(window.location.hash.slice(1));
  const isEn = parameters.get('lang') === 'en';
  const value = parameters.get('code') || '';
  // Never store the OTP, submit it, send it to analytics or leave it in history.
  window.history.replaceState(null, '', window.location.pathname);
  document.documentElement.lang = isEn ? 'en' : 'ar';
  document.documentElement.dir = isEn ? 'ltr' : 'rtl';
  const code = document.getElementById('code');
  const copy = document.getElementById('copy');
  const status = document.getElementById('status');
  document.getElementById('title').textContent = isEn ? 'Copy your verification code' : 'نسخ رمز التحقق';
  document.getElementById('description').textContent = isEn ? 'Copy the code, then return to the page where you requested it.' : 'انسخ الرمز ثم عد إلى الصفحة التي طلبته منها.';
  document.getElementById('notice').textContent = isEn ? 'Never share this code. This page does not check whether it is valid.' : 'لا تشارك هذا الرمز مع أي شخص. هذه الصفحة لا تتحقق من صلاحية الرمز.';
  document.title = isEn ? 'Copy verification code | BHI47A' : 'نسخ رمز التحقق | BHI47A';
  code.setAttribute('aria-label', isEn ? 'Verification code' : 'رمز التحقق');
  copy.textContent = isEn ? 'Copy code' : 'نسخ الرمز';
  if (!/^\d{6}$/.test(value)) {
    status.textContent = isEn ? 'Open this page using the button in your verification email, or copy the code directly from the email.' : 'افتح هذه الصفحة من الزر داخل رسالة التحقق، أو انسخ الرمز مباشرة من البريد.';
    return;
  }
  code.value = value;
  copy.disabled = false;
  code.addEventListener('click', () => code.select());
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code.value);
      status.textContent = isEn ? 'Copied. Return to your verification page.' : 'تم النسخ. عد الآن إلى صفحة التحقق.';
    } catch {
      code.focus();
      code.select();
      status.textContent = isEn ? 'Automatic copying is unavailable. Copy the selected code manually.' : 'النسخ التلقائي غير متاح. انسخ الرمز المحدد يدوياً.';
    }
  });
  window.addEventListener('pagehide', () => { code.value = ''; copy.disabled = true; });
})();
