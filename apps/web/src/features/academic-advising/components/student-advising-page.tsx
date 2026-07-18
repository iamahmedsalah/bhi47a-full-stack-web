"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  CheckCircle2,
  Loader2,
  MessageSquareText,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { advisingApi, advisingKeys } from "../api/advising-api";
import { getApiErrorMessage } from "@/lib/api";
export function StudentAdvisingPage({ locale }: { locale: string }) {
  const ar = locale === "ar";
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: advisingKeys.student,
    queryFn: advisingApi.student,
  });
  const review = useMutation({
    mutationFn: advisingApi.requestReview,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: advisingKeys.student });
      toast.success(ar ? "تم إرسال طلب المراجعة" : "Review requested");
    },
    onError: (e) => toast.error(getApiErrorMessage(e)),
  });
  const acknowledge = useMutation({
    mutationFn: advisingApi.acknowledge,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: advisingKeys.student });
      toast.success(ar ? "تم تأكيد الخطة" : "Plan acknowledged");
    },
    onError: (e) => toast.error(getApiErrorMessage(e)),
  });
  if (query.isLoading)
    return <Loader2 className="mx-auto mt-24 animate-spin" />;
  if (!query.data)
    return (
      <div className="rounded-3xl border border-dashed border-white/15 p-16 text-center text-muted-foreground">
        {ar
          ? "لم تبدأ جلسة الإرشاد الأكاديمي بعد"
          : "Your academic advising case has not started yet."}
      </div>
    );
  const data = query.data;
  return (
    <div className="space-y-5">
      <header className="rounded-3xl border border-white/10 bg-card/80 p-6">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <p className="text-xs uppercase text-sky-300">
              {ar ? "الإرشاد الأكاديمي" : "Academic Advising"}
            </p>
            <h1 className="mt-1 text-2xl font-bold">
              {ar ? "خطتك الدراسية المعتمدة" : "Your approved academic plan"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {data.case.academicYear} · {data.case.semester} ·{" "}
              {data.case.status}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => review.mutate()}>
              <MessageSquareText className="me-2 h-4 w-4" />
              {ar ? "طلب مراجعة" : "Request review"}
            </Button>
            <Button
              disabled={data.case.status !== "APPROVED"}
              onClick={() => acknowledge.mutate()}
            >
              <CheckCircle2 className="me-2 h-4 w-4" />
              {ar ? "تأكيد الخطة" : "Acknowledge"}
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              <span className="sr-only">Print</span>
            </Button>
          </div>
        </div>
      </header>
      <section className="rounded-3xl border border-white/10 bg-card/70 p-5">
        <h2 className="mb-4 text-lg font-bold">
          {ar ? "المقررات المعتمدة" : "Approved courses"}
        </h2>
        {data.approvedPlan ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.approvedPlan.selectedCourses.map((course) => (
              <article
                key={course._id}
                className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4"
              >
                <span className="font-mono text-sm font-bold text-sky-300">
                  {course.code}
                </span>
                <h3 className="font-semibold">
                  {ar ? course.nameAr : course.nameEn}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {course.creditHours ?? 0} {ar ? "ساعات" : "credits"}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {ar
              ? "لم يتم اعتماد خطة نهائية بعد"
              : "No final plan has been approved yet."}
          </p>
        )}
        {data.approvedPlan?.studentVisibleNotes && (
          <div className="mt-4 rounded-2xl bg-secondary/30 p-4 text-sm">
            {data.approvedPlan.studentVisibleNotes}
          </div>
        )}
      </section>
      <section className="rounded-3xl border border-violet-500/20 bg-violet-500/5 p-5">
        <div className="flex items-start gap-3">
          <Bot className="h-6 w-6 text-violet-300" />
          <div>
            <h2 className="font-bold">
              {ar ? "المساعد الأكاديمي" : "Academic assistant"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {ar
                ? "سيتم توفير مساعد لشرح التوصيات والإجابة عن أسئلتك قريباً."
                : "An assistant for explaining recommendations and answering questions will be available soon."}
            </p>
            <Button className="mt-3" size="sm" disabled>
              {ar ? "الميزة غير مفعلة" : "Feature disabled"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
