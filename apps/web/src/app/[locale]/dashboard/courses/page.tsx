"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { LoadingState, ErrorState } from "@/components/ui/feedback";
import { StudentCourseCatalog } from "@/features/courses/components/student-course-catalog";
import { getPublicPortalSettings, settingsKeys } from "@/features/settings/api";

export default function StudentCoursesPage() {
  const { locale } = useParams<{ locale: string }>();
  const ar = locale === "ar";
  const settings = useQuery({
    queryKey: settingsKeys.publicPortalSettings,
    queryFn: getPublicPortalSettings,
    staleTime: 60_000,
  });
  const profile = useQuery({
    queryKey: ["student-profile"],
    enabled: Boolean(settings.data && settings.data.syllabiVisible !== false),
    queryFn: async () => {
      type Profile = { isBlocked?: boolean };
      const { data } = await api.get<Profile | { data: Profile }>("/students/me/profile");
      return "data" in data ? data.data : data;
    },
    staleTime: 5 * 60_000,
  });

  if (settings.isPending || profile.isLoading) {
    return <LoadingState title={ar ? "جارٍ تحميل المقررات…" : "Loading courses…"} />;
  }
  if (!settings.data || (settings.data.syllabiVisible !== false && !profile.data)) {
    return <ErrorState description={ar ? "تعذّر تحميل بيانات المقررات." : "Could not load course information."} onRetry={() => {
      if (!settings.data) void settings.refetch();
      else void profile.refetch();
    }} />;
  }
  if (settings.data.syllabiVisible === false) {
    return <p className="rounded-xl border border-border bg-card p-4 text-sm">{ar ? "صفحة المقررات غير متاحة حاليًا." : "Courses are currently unavailable."}</p>;
  }

  return (
    <StudentCourseCatalog
      locale={locale}
      blocked={profile.data?.isBlocked === true}
      registrationVisible={settings.data.registrationVisible !== false}
    />
  );
}
