"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronRight, FileText, Layers, Lock, Search } from "lucide-react";
import { courseCurriculumSummary, formatStaffDisplayName } from "@student-portal/shared";
import api, { apiBaseUrl } from "@/lib/api";
import { normalizeSearchText } from "@/lib/search-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState, LoadingState } from "@/components/ui/feedback";
import { CourseMaterialsDialog } from "./course-materials-dialog";

interface CatalogCourse {
  _id?: string;
  courseId?: string;
  code: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  level: string;
  creditHours?: number;
  coverImageUrl?: string;
  syllabusPdfUrl?: string;
  isRegistered?: boolean;
  doctorName?: string;
  doctorNameAr?: string;
}

interface CatalogData {
  registeredCourses: CatalogCourse[];
  availableLevelCourses: CatalogCourse[];
}

export function StudentCourseCatalog({
  locale, preview = false, blocked, registrationVisible,
}: {
  locale: string;
  preview?: boolean;
  blocked: boolean;
  registrationVisible?: boolean;
}) {
  const ar = locale === "ar";
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"all" | "registered">("all");
  const [selected, setSelected] = useState<CatalogCourse | null>(null);
  const query = useQuery({
    queryKey: ["student-syllabi"],
    queryFn: async () => (await api.get<CatalogData>("/students/me/syllabi")).data,
    staleTime: 15 * 60 * 1000,
  });
  const registered = query.data?.registeredCourses ?? [];
  const all = new Map(registered.map(course => [course.code.toUpperCase(), course]));
  for (const course of query.data?.availableLevelCourses ?? []) {
    const code = course.code.toUpperCase();
    if (!all.has(code)) all.set(code, course);
  }
  const name = (course: CatalogCourse) =>
    (ar ? course.nameAr : course.nameEn) || course.name;
  const searchTerm = normalizeSearchText(search);
  const matches = (scope === "registered" || (preview && registered.length)
    ? registered
    : [...all.values()]
  ).filter(course => [course.code, course.name, course.nameAr, course.nameEn]
    .some(value => value && normalizeSearchText(value).includes(searchTerm)));
  const courses = preview ? matches.slice(0, 3) : matches;
  const title = ar ? "المقررات والمناهج" : "Courses & syllabi";
  const Heading = preview ? "h2" : "h1";
  const CourseHeading = preview ? "h3" : "h2";

  return (
    <section
      dir={ar ? "rtl" : "ltr"}
      className={
        preview
          ? "flex h-full min-w-0 flex-col justify-between gap-4"
          : "min-w-0 space-y-4"
      }
    >
      <div className="space-y-4">
        <header
          className={
            preview
              ? "flex items-start justify-between gap-3 border-b border-border pb-3.5"
              : "flex flex-wrap items-center justify-between gap-3"
          }
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-squircle border border-primary/25 bg-primary/10 text-primary">
              <BookOpen className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 text-start">
              <Heading
                className={
                  preview
                    ? "font-bold text-base text-foreground leading-snug truncate"
                    : "text-xl font-bold sm:text-2xl"
                }
              >
                {title}
              </Heading>
              <p className="text-[11px] leading-relaxed text-muted-foreground mt-0.5">
                {ar
                  ? "المناهج المعتمدة والمحاضرات والسكاشن"
                  : "Official syllabi, lectures and sections"}
              </p>
            </div>
          </div>
          {preview ? (
            <Link
              href={`/${locale}/dashboard/courses`}
              className="inline-flex items-center gap-1 rounded-squircle border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors whitespace-nowrap shrink-0"
            >
              <span>{ar ? "عرض الكل" : "View All"}</span>
              <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" />
            </Link>
          ) : (
            registrationVisible && (
              <Button asChild variant="outline" className="min-h-11 rounded-squircle">
                <Link href={`/${locale}/dashboard/registration`}>
                  {ar ? "الخطة والتسجيل" : "Study plan & registration"}
                </Link>
              </Button>
            )
          )}
        </header>
        {!preview && all.size > 0 && (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute start-3 top-3.5 size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label={ar ? "ابحث باسم المقرر أو الكود" : "Search by course name or code"}
                placeholder={ar ? "ابحث باسم المقرر أو الكود" : "Search by course name or code"}
                className="h-11 rounded-squircle ps-9"
              />
            </div>
            {registered.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={scope === "all" ? "secondary" : "ghost"}
                  className="rounded-squircle"
                  aria-pressed={scope === "all"}
                  onClick={() => setScope("all")}
                >
                  {ar ? "كل المقررات" : "All courses"}
                </Button>
                <Button
                  type="button"
                  variant={scope === "registered" ? "secondary" : "ghost"}
                  className="rounded-squircle"
                  aria-pressed={scope === "registered"}
                  onClick={() => setScope("registered")}
                >
                  {ar ? "مقرراتي المسجلة" : "My enrolled courses"}
                </Button>
              </div>
            )}
          </div>
        )}
        {query.isLoading ? (
          <LoadingState title={ar ? "جارٍ تحميل المقررات…" : "Loading courses…"} />
        ) : query.isError ? (
          <ErrorState
            description={ar ? "تعذّر تحميل المقررات." : "Could not load courses."}
            onRetry={() => void query.refetch()}
          />
        ) : courses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-secondary/20 px-4 py-7 text-center flex flex-col items-center justify-center gap-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-squircle border border-primary/20 bg-primary/10 text-primary">
              <BookOpen className="w-5 h-5" aria-hidden="true" />
            </div>
            <p className="text-sm font-bold text-foreground">
              {searchTerm
                ? ar
                  ? "لا توجد مقررات تطابق البحث."
                  : "No courses match your search."
                : ar
                  ? "لا توجد مقررات متاحة في الفصل الحالي."
                  : "No courses are available this term."}
            </p>
          </div>
        ) : (
          <ul
            className={
              preview ? "grid gap-2.5" : "grid gap-3 md:grid-cols-2 2xl:grid-cols-3"
            }
          >
            {courses.map((course) => (
              <li
                key={course.code}
                className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/70 bg-card/80 p-3 sm:p-4 transition-colors hover:border-primary/30"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="relative grid h-13 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-primary/20 bg-primary/5 text-primary">
                    <BookOpen className="size-4" aria-hidden="true" />
                    {course.coverImageUrl && (
                      <Image
                        unoptimized
                        fill
                        sizes="40px"
                        src={course.coverImageUrl}
                        alt=""
                        className="object-cover"
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                        }}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1 text-start">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="inline-flex items-center rounded-squircle border border-primary/25 bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-bold text-primary">
                        <bdi dir="ltr">{course.code}</bdi>
                      </span>
                      {course.isRegistered && (
                        <span className="inline-flex items-center rounded-squircle border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                          {ar ? "مسجل" : "Enrolled"}
                        </span>
                      )}
                    </div>
                    <CourseHeading className="break-words text-sm font-semibold leading-snug text-foreground">
                      <bdi>{name(course)}</bdi>
                    </CourseHeading>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {courseCurriculumSummary(course, locale)} ·{" "}
                      {ar ? `المستوى ${course.level}` : `Level ${course.level}`} ·{" "}
                      {course.creditHours ?? 3} {ar ? "ساعات" : "credits"}
                    </p>
                    {(course.doctorName || course.doctorNameAr) && (
                      <p className="break-words text-xs text-muted-foreground">
                        <bdi>
                          {formatStaffDisplayName(
                            {
                              name: course.doctorName,
                              nameAr: course.doctorNameAr,
                              staffType: "doctor",
                            },
                            locale,
                          )}
                        </bdi>
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border/60 pt-3">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-auto min-h-9 rounded-squircle whitespace-normal px-2.5 py-1.5 text-xs font-semibold cursor-pointer"
                    onClick={() => setSelected(course)}
                  >
                    <Layers aria-hidden="true" />
                    {ar ? "المحاضرات والسكاشن" : "Lectures & sections"}
                  </Button>
                  {course.syllabusPdfUrl && !blocked ? (
                    <Button
                      asChild
                      variant="outline"
                      className="h-auto min-h-9 rounded-squircle whitespace-normal px-2.5 py-1.5 text-xs font-semibold"
                    >
                      <a
                        href={
                          course._id
                            ? `${apiBaseUrl}/courses/${course._id}/syllabus/download`
                            : course.syllabusPdfUrl
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <FileText aria-hidden="true" />
                        {ar ? "منهج PDF" : "Syllabus PDF"}
                      </a>
                    </Button>
                  ) : (
                    <span className="flex min-h-9 items-center justify-center gap-1.5 rounded-squircle border border-border/50 bg-muted/40 px-2.5 py-1.5 text-center text-xs text-muted-foreground">
                      {course.syllabusPdfUrl ? (
                        <>
                          <Lock className="size-3.5 shrink-0" aria-hidden="true" />
                          {ar ? "المنهج محجوب" : "Syllabus locked"}
                        </>
                      ) : ar ? (
                        "المنهج قيد الإعداد"
                      ) : (
                        "Syllabus pending"
                      )}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {preview && (
        <Link href={`/${locale}/dashboard/courses`} className="w-full">
          <button
            type="button"
            className="w-full h-10 text-xs font-semibold rounded-squircle bg-secondary hover:bg-secondary/80 text-foreground border border-border/60 transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>
              {ar ? "عرض الخطة الدراسية والمقررات" : "View curriculum & courses"}
            </span>
            <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" />
          </button>
        </Link>
      )}
      {selected && (
        <CourseMaterialsDialog
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          courseId={selected._id || selected.courseId || ""}
          courseCode={selected.code}
          courseName={name(selected)}
          locale={locale}
          isStudent
          isStudentBlocked={blocked}
        />
      )}
    </section>
  );
}
