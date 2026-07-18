import { AdvisingWorkspace } from "@/features/academic-advising/components/advising-workspace";
export default async function AcademicAdvisingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <AdvisingWorkspace locale={locale} />;
}
