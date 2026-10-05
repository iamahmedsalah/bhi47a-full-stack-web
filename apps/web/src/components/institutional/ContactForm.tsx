'use client';

import React, { useState } from 'react';
import { Send, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface ContactFormProps {
  locale: string;
}

export function ContactForm({ locale }: ContactFormProps) {
  const isAr = locale === 'ar';

  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    subject: 'admission',
    message: '',
  });

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName.trim() || !formData.phone.trim() || !formData.message.trim()) {
      setStatus('error');
      return;
    }

    setStatus('submitting');
    // Simulate network submission
    await new Promise((resolve) => setTimeout(resolve, 800));
    setStatus('success');
  };

  return (
    <div className="p-8 sm:p-10 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
      <h2 className="text-xl font-bold text-white mb-2">
        {isAr ? 'نموذج الاستفسار والتواصل الإلكتروني' : 'Online Inquiry & Contact Form'}
      </h2>
      <p className="text-xs sm:text-sm text-slate-400 mb-8">
        {isAr
          ? 'يرجى ملء النموذج أدناه بدقة، وسيقوم ممثل شؤون الطلاب أو القبول والتسجيل بالتواصل معكم خلال 24 ساعة عمل.'
          : 'Please complete the form below. A student affairs representative will reach out within 24 working hours.'}
      </p>

      {status === 'success' ? (
        <div className="p-8 rounded-xl bg-teal-500/10 border border-teal-500/30 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">
            {isAr ? 'تم استلام استفساركم بنجاح' : 'Inquiry Received Successfully'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
            {isAr
              ? 'شكراً لتواصلكم مع المعهد العالي للعلوم الإدارية المتقدمة والحاسبات. تم إرسال رسالتكم لإدارة الاستعلامات وشؤون الطلاب وسنوافيكم بالرد قريباً.'
              : 'Thank you for reaching out to BHI47a. Your inquiry has been dispatched to Admissions and Student Affairs.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setStatus('idle');
              setFormData({
                fullName: '',
                phone: '',
                email: '',
                subject: 'admission',
                message: '',
              });
            }}
            className="mt-4 px-5 py-2.5 rounded-squircle bg-slate-800 hover:bg-slate-700 text-teal-300 text-xs font-semibold transition-colors"
          >
            {isAr ? 'إرسال استفسار جديد' : 'Send Another Inquiry'}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {status === 'error' && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                {isAr
                  ? 'يرجى التأكد من ملء جميع الحقول الإلزامية (الاسم، الهاتف، الرسالة).'
                  : 'Please fill in all required fields (Name, Phone, Message).'}
              </span>
            </div>
          )}

          <div>
            <label htmlFor="fullName" className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isAr ? 'الاسم بالكامل *' : 'Full Name *'}
            </label>
            <input
              type="text"
              id="fullName"
              required
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              placeholder={isAr ? 'أدخل اسمك ثلاثياً أو رباعياً' : 'Enter your full name'}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="phone" className="block text-xs font-semibold text-slate-300 mb-1.5">
                {isAr ? 'رقم الهاتف / واتساب *' : 'Phone / WhatsApp *'}
              </label>
              <input
                type="tel"
                id="phone"
                dir="ltr"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="01xxxxxxxxx"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder:text-slate-500 text-sm text-start font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-slate-300 mb-1.5">
                {isAr ? 'البريد الإلكتروني' : 'Email Address'}
              </label>
              <input
                type="email"
                id="email"
                dir="ltr"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="student@example.com"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder:text-slate-500 text-sm text-start font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="subject" className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isAr ? 'موضوع الاستفسار' : 'Inquiry Subject'}
            </label>
            <select
              id="subject"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="admission">
                {isAr ? 'استفسار عن شروط القبول والتنسيق' : 'Admissions & Requirements'}
              </option>
              <option value="transfer">
                {isAr ? 'التحويلات ونقل القيد من كليات ومعاهد أخرى' : 'Student Transfers'}
              </option>
              <option value="programs">
                {isAr ? 'استفسار عن الشعب والبرامج الدراسية (BIS - محاسبة ومراجعة)' : 'Academic Programs (BIS / Accounting & Auditing)'}
              </option>
              <option value="tuition">
                {isAr ? 'المصروفات الدراسية وطرق السداد' : 'Tuition & Payment Inquiries'}
              </option>
              <option value="other">
                {isAr ? 'استفسار عام أو موضوع آخر' : 'General Inquiry'}
              </option>
            </select>
          </div>

          <div>
            <label htmlFor="message" className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isAr ? 'نص الاستفسار أو الرسالة *' : 'Message / Inquiry *'}
            </label>
            <textarea
              id="message"
              rows={4}
              required
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder={
                isAr
                  ? 'اكتب استفسارك بالتفصيل وسيقوم المختص بالرد عليك...'
                  : 'Write your inquiry with all details...'
              }
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <button
            type="submit"
            disabled={status === 'submitting'}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3 rounded-squircle bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm transition-all disabled:opacity-50"
          >
            {status === 'submitting' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{isAr ? 'جاري الإرسال...' : 'Sending...'}</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4 rtl:-scale-x-100" />
                <span>{isAr ? 'إرسال الاستفسار' : 'Submit Inquiry'}</span>
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
}
