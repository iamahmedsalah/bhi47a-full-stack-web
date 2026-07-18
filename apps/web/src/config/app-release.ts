export const APP_VERSION = '1.0.0';

export const APP_RELEASE_NOTES = {
  student: {
    en: [
      'Google sign-in with account linking and verification.',
      'Password recovery with OTP verification.',
      'Cleaner profile security and contact controls.',
    ],
    ar: [
      'تسجيل الدخول عبر Google مع ربط الحساب والتحقق.',
      'استعادة كلمة المرور باستخدام رمز OTP.',
      'تحسين إعدادات الأمان وبيانات التواصل في الملف الشخصي.',
    ],
  },
  admin: {
    en: [
      'Student portal authentication and account recovery improvements.',
      'Email delivery logs with SMTP or Resend provider support.',
      'More stable student profile and registration management flows.',
    ],
    ar: [
      'تحسينات تسجيل الدخول واستعادة الحسابات في بوابة الطالب.',
      'سجلات إرسال البريد مع دعم SMTP أو Resend.',
      'تحسين استقرار إدارة ملفات الطلاب والتسجيل.',
    ],
  },
} as const;
