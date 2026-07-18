import { redirect } from 'next/navigation';

export default async function LegacyAdminRegistrationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/admin/academic-advising`);
}
