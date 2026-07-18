import Link from 'next/link';

export default function GlobalNotFoundPage() {
  return (
    <html lang="ar" dir="rtl">
      <body className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
        <main className="max-w-lg rounded-3xl border border-border bg-card p-8 text-center">
          <p className="text-sm font-semibold text-primary">404</p>
          <h1 className="mt-2 text-2xl font-black">الصفحة غير موجودة</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            The requested page could not be found.
          </p>
          <Link
            href="/ar"
            className="mt-6 inline-flex rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
          >
            العودة للرئيسية
          </Link>
        </main>
      </body>
    </html>
  );
}
