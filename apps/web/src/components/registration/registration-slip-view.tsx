"use client";

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { downloadRegistrationPdf, getRegistrationCopy, openRegistrationPrintView, registrationDocumentPage, type PrintableRegistrationForm, type RegistrationLocale } from '@/lib/registration-print';

export function RegistrationSlipView({ form, locale }: { form: PrintableRegistrationForm; locale: string }) {
  const [activeLocale, setActiveLocale] = useState<RegistrationLocale>(locale === 'en' ? 'en' : 'ar');
  const [downloading, setDownloading] = useState(false);
  const copy = getRegistrationCopy(activeLocale);
  return <div className="space-y-4" dir={copy.dir}>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => setActiveLocale(activeLocale === 'ar' ? 'en' : 'ar')}>{copy.switchLangBtn}</Button>
      <Button onClick={() => {
        if (!openRegistrationPrintView(form, 'print', activeLocale)) toast.error(activeLocale === 'ar' ? 'يرجى السماح بالنوافذ المنبثقة' : 'Please allow pop-ups');
      }}>{copy.printBtn}</Button>
      <Button variant="outline" disabled={downloading} onClick={async () => {
        setDownloading(true);
        try { await downloadRegistrationPdf(form, activeLocale); }
        catch { toast.error(activeLocale === 'ar' ? 'فشل إنشاء PDF. أعد المحاولة.' : 'PDF generation failed. Please retry.'); }
        finally { setDownloading(false); }
      }}>{downloading ? copy.generatingPdf : copy.downloadBtn}</Button>
    </div>
    <div className="overflow-auto rounded-xl border border-border">
      <iframe title={copy.title} sandbox="allow-same-origin" className="min-w-198.5 w-full border-0 bg-white" style={{ height: 1150 }}
        srcDoc={registrationDocumentPage(form, activeLocale)}
        onLoad={(event) => { const frame = event.currentTarget; if (frame.contentDocument) frame.style.height = `${frame.contentDocument.documentElement.scrollHeight + 24}px`; }} />
    </div>
  </div>;
}
