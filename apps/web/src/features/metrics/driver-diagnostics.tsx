'use client';

import { Card } from '@/components/ui/card';
import type { MetricsSummaryResponse } from './api';

type Diagnostics = NonNullable<MetricsSummaryResponse['database']['driverDiagnostics']>;
const format = (value: number | null | undefined) => value == null ? '—' :
  value.toLocaleString('en-GB', { maximumFractionDigits: 1 });
const categories: Record<string, [string, string]> = {
  socket_timeout: ['انتهاء مهلة اتصال قاعدة البيانات', 'Socket timeout'],
  server_selection: ['تعذر اختيار خادم قاعدة البيانات', 'Server selection'],
  checkout_timeout: ['انتهاء مهلة انتظار اتصال', 'Checkout timeout'],
  execution_timeout: ['انتهاء مهلة تنفيذ الاستعلام', 'Query execution timeout'],
  operation_timeout: ['انتهاء مهلة العملية', 'Operation timeout'],
  authentication: ['فشل مصادقة قاعدة البيانات', 'Database authentication'],
  authorization: ['رفض صلاحية قاعدة البيانات', 'Database authorization'],
  dns: ['فشل تحليل اسم الخادم', 'DNS failure'],
  network: ['فشل الشبكة', 'Network failure'],
  topology: ['تغير أو تعطل خادم قاعدة البيانات', 'Topology failure'],
  pool_cleared: ['تفريغ مجمع الاتصالات', 'Pool cleared'],
  other: ['خطأ آخر', 'Other failure'],
};

export function DriverDiagnosticsPanel({ data, isAr }: { data?: Diagnostics; isAr: boolean }) {
  const text = (ar: string, en: string) => isAr ? ar : en;
  const cards = data ? [
    [text('اتصالات مستخدمة الآن', 'Checked out now'), data.checkedOut],
    [text('طلبات تنتظر اتصالًا الآن', 'Waiting now'), data.waiters],
    [text('متوسط انتظار الاتصال (ms)', 'Mean checkout (ms)'), data.checkout.avgMs],
    [text('أقصى انتظار اتصال (ms)', 'Max checkout (ms)'), data.checkout.maxMs],
    [text('فشل الحصول على اتصال', 'Checkout failures'), data.checkout.failures],
    [text('مرات تفريغ المجمع', 'Pool clears'), data.poolClears],
  ] as const : [];
  return <Card className="space-y-4 p-4" dir={isAr ? 'rtl' : 'ltr'}>
    <h2 className="font-bold">{text('تشخيص اتصال وأوامر MongoDB', 'MongoDB connection and command diagnostics')}</h2>
    <p className="text-xs text-muted-foreground">{text(
      'منذ تشغيل هذه النسخة من API. أحدث 50 حدث فشل؛ قد تسجل العملية والأمر نفس الخطأ. النتائج مستقلة عن HTTP. لا تُعرض نصوص الأخطاء أو بيانات الاستعلامات.',
      'Since this API process started. Latest 50 failure events; operation and command events may describe the same error. HTTP outcomes are separate. Error messages and query data are excluded.',
    )}</p>
    {!data ? <p>{text('التشخيص غير متاح في إصدار API الحالي.', 'Diagnostics are unavailable in this API version.')}</p> : <>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map(([label, number]) => <div key={label} className="rounded-xl border border-border p-3">
          <dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-mono text-xl"><bdi>{format(number)}</bdi></dd>
        </div>)}
      </dl>
      <h3 className="text-sm font-semibold">{text('محاولات الأوامر: الإجمالي / الفشل / متوسط الزمن', 'Command attempts: total / failed / mean duration')}</h3>
      <ul className="flex flex-wrap gap-2">
        {data.commands.map((item) => <li key={item.command} className="rounded-xl border border-border px-3 py-2 text-xs">
          <bdi className="font-mono">{item.command}: {format(item.count)} / {format(item.failures)} / {format(item.avgMs)} ms</bdi>
        </li>)}
      </ul>
      <h3 className="text-sm font-semibold">{text('أحدث حالات الفشل', 'Recent failures')}</h3>
      {data.recentFailures.length === 0 ? <p className="text-sm text-muted-foreground">{text('لم تُرصد حالات فشل منذ التشغيل.', 'No failures recorded since startup.')}</p> :
        <ul className="max-h-96 space-y-2 overflow-auto">
          {data.recentFailures.map((item, index) => <li key={`${item.timestamp}-${index}`} className="space-y-1 rounded-xl border border-rose-500/30 p-3 text-sm">
            <p className="font-semibold">{(categories[item.category] ?? categories.other)[isAr ? 0 : 1]}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(item.timestamp).toLocaleString(isAr ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo' })}
              {' · '}<bdi>{item.operation ?? item.command} · {format(item.durationMs)} ms · {item.errorName}{item.code !== undefined ? ` (${item.code})` : ''}</bdi>
            </p>
            {item.stage && <p><bdi>{item.stage}</bdi></p>}
            {item.requestId && <p className="break-all text-xs">{text('معرّف الطلب:', 'Request ID:')} <bdi>{item.requestId}</bdi></p>}
          </li>)}
        </ul>}
    </>}
  </Card>;
}
