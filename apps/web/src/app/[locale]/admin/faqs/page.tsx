import { FaqPage } from "@/features/faqs/faq-page";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  return <FaqPage ar={(await params).locale === "ar"} admin />;
}
