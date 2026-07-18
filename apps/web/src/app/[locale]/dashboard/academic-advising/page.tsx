import { StudentAdvisingPage } from "@/features/academic-advising/components/student-advising-page";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <StudentAdvisingPage locale={locale} />;
}
