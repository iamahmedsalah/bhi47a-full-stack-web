"use client";

import { AcademicYearSelect } from "@/components/ui/academic-year-select";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Menu from "@radix-ui/react-dropdown-menu";
import {
  BookOpen,
  GraduationCap,
  Loader2,
  MoreVertical,
  Plus,
  Search,
  UserRound,
  UserSearch,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getApiErrorMessage } from "@/lib/api";
import {
  changeStudentEnrollment,
  enrollmentKeys,
  getStudentEnrollment,
  searchEnrollmentCourses,
  searchEnrollmentStudents,
  type EnrollmentCourse,
  type EnrollmentStudent,
} from "../student-enrollment-api";

function useSearch(value: string) {
  const [search, setSearch] = useState(value.trim());
  useEffect(() => {
    const timer = setTimeout(() => setSearch(value.trim()), 300);
    return () => clearTimeout(timer);
  }, [value]);
  return search;
}

export function StudentCourseEnrollmentDialog({
  locale,
  principalId,
  onClose,
}: {
  locale: string;
  principalId: string;
  onClose: () => void;
}) {
  const ar = locale === "ar";
  const text = (arabic: string, english: string) => (ar ? arabic : english);
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const studentSearch = useSearch(search);
  const [student, setStudent] = useState<EnrollmentStudent | null>(null);
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState("first");
  const [courseSearch, setCourseSearch] = useState("");
  const courseTerm = useSearch(courseSearch);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<{
    action: "add" | "withdraw";
    course: EnrollmentCourse;
  } | null>(null);
  const term = { academicYear, semester };
  const yearParts = /^(\d{4})-(\d{4})$/.exec(academicYear);
  const validTerm = Boolean(
    yearParts && Number(yearParts[2]) === Number(yearParts[1]) + 1,
  );
  const scope = [...enrollmentKeys.all, principalId];
  const students = useQuery({
    queryKey: [...scope, "students", studentSearch],
    queryFn: ({ signal }) => searchEnrollmentStudents(studentSearch, signal),
    enabled: !student && studentSearch.length >= 2,
    staleTime: 15_000,
  });
  const detail = useQuery({
    queryKey: [...scope, student?.userId, academicYear, semester],
    queryFn: ({ signal }) =>
      getStudentEnrollment(student!.userId, term, signal),
    enabled: Boolean(student && validTerm),
    staleTime: 0,
  });
  const editable =
    detail.data?.status == null || detail.data?.status === "approved";
  const available = useQuery({
    queryKey: [
      ...scope,
      student?.userId,
      academicYear,
      semester,
      "available",
      courseTerm,
    ],
    queryFn: ({ signal }) =>
      searchEnrollmentCourses(student!.userId, term, courseTerm, signal),
    enabled: Boolean(student && validTerm && detail.isSuccess && editable),
    staleTime: 0,
  });
  const name = (item: EnrollmentStudent) =>
    ar ? item.fullNameAr || item.fullName : item.fullNameEn || item.fullName;
  const courseName = (course: EnrollmentCourse) =>
    ar
      ? course.nameAr || course.name || course.code
      : course.nameEn || course.name || course.code;
  const mutation = useMutation({
    mutationFn: ({
      action,
      courseId,
      expectedVersion,
    }: {
      action: "add" | "withdraw";
      courseId: string;
      expectedVersion: string;
    }) =>
      changeStudentEnrollment(
        student!.userId,
        action,
        term,
        courseId,
        expectedVersion,
      ),
    onSuccess: async (result) => {
      toast.success(
        result.withdrawn
          ? text(
              "تم سحب المادة من تسجيل الطالب",
              "Course withdrawn from the student registration",
            )
          : result.alreadyEnrolled
            ? text("الطالب مسجل بالمادة بالفعل", "Student is already enrolled")
            : text(
                "تم تسجيل المادة للطالب بنجاح",
                "Course added to the student registration",
              ),
      );
      setError("");
      await Promise.all([
        client.invalidateQueries({ queryKey: enrollmentKeys.all }),
        client.invalidateQueries({ queryKey: ["courses"] }),
        client.invalidateQueries({
          queryKey: ["admin-course-enrolled-students"],
        }),
        client.invalidateQueries({ queryKey: ["course-enrollments-count"] }),
        client.invalidateQueries({ queryKey: ["control"] }),
      ]);
    },
    onError: (cause) => {
      const message = getApiErrorMessage(cause);
      setError(message);
      toast.error(message);
      void client.invalidateQueries({ queryKey: enrollmentKeys.all });
    },
  });
  const loading = (
    <p
      role="status"
      className="flex items-center gap-2 py-6 text-sm text-muted-foreground"
    >
      <Loader2 className="size-4 animate-spin" />
      {text("جارٍ التحميل…", "Loading…")}
    </p>
  );
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) onClose();
        }}
      >
        <DialogContent
          dir={ar ? "rtl" : "ltr"}
          className="flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-3xl flex-col overflow-hidden rounded-2xl"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-start">
              <UserSearch className="size-5 text-primary" />
              {text(
                "إدارة تسجيل مواد الطالب",
                "Manage student course enrollment",
              )}
            </DialogTitle>
            <DialogDescription className="text-start">
              {text(
                "ابحث عن الطالب لإدارة مواده في السنة والترم المحددين. السحب لا يحذف درجاته.",
                "Find a student to manage courses for a specific year and term. Withdrawal does not delete grades.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto pe-1">
            {!student ? (
              <>
                <div className="relative">
                  <Search className="absolute start-3 top-3 size-4 text-muted-foreground" />
                  <Input
                    autoFocus
                    maxLength={100}
                    className="ps-9"
                    aria-label={text(
                      "بحث الطالب بالكود أو الاسم",
                      "Search student code or name",
                    )}
                    placeholder={text(
                      "كود الطالب أو اسمه…",
                      "Student code or name…",
                    )}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                {studentSearch.length < 2 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {text(
                      "اكتب حرفين على الأقل للبحث.",
                      "Enter at least two characters to search.",
                    )}
                  </p>
                ) : students.isFetching ? (
                  loading
                ) : students.isError ? (
                  <p role="alert">{getApiErrorMessage(students.error)}</p>
                ) : (
                  <>
                    <div className="space-y-2">
                      {students.data?.items.map((item) => (
                        <Button
                          key={item.userId}
                          variant="outline"
                          className="h-auto w-full justify-start gap-3 rounded-xl p-3 text-start"
                          onClick={() => {
                            setStudent(item);
                            setAcademicYear(item.academicYear);
                            setSemester(
                              ["first", "second", "summer"].includes(
                                item.semester,
                              )
                                ? item.semester
                                : "first",
                            );
                          }}
                        >
                          <UserRound className="size-5 shrink-0 text-primary" />
                          <span className="min-w-0 flex-1 whitespace-normal">
                            <span className="block font-semibold">
                              {name(item)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              <bdi>{item.studentCode}</bdi> ·{" "}
                              {text("المستوى", "Level")} {item.level}
                            </span>
                          </span>
                        </Button>
                      ))}
                    </div>
                    {!students.data?.items.length && (
                      <p className="py-6 text-center text-sm">
                        {text(
                          "لا يوجد طالب مطابق للبحث.",
                          "No matching student found.",
                        )}
                      </p>
                    )}
                    {students.data?.hasMore && (
                      <p className="text-xs text-muted-foreground">
                        {text(
                          "توجد نتائج أخرى؛ اكتب كودًا أو اسمًا أكثر تحديدًا.",
                          "More results exist; refine the code or name.",
                        )}
                      </p>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <div>
                    <p className="flex items-center gap-2 font-bold">
                      <GraduationCap className="size-5 text-primary" />
                      {name(student)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <bdi>{student.studentCode}</bdi> ·{" "}
                      {text("المستوى", "Level")} {student.level} ·{" "}
                      {student.department}
                    </p>
                  </div>
                  <Button
                    disabled={mutation.isPending}
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setStudent(null);
                      setCourseSearch("");
                      setError("");
                    }}
                  >
                    {text("تغيير الطالب", "Change student")}
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <AcademicYearSelect
                    value={academicYear}
                    disabled={mutation.isPending}
                    defaultToCurrent
                    onChange={(year) => {
                      setAcademicYear(year);
                      setError("");
                    }}
                  />
                  <div className="space-y-1 text-xs">
                    <span>{text("الترم", "Semester")}</span>
                    <Select
                      value={semester}
                      disabled={mutation.isPending}
                      onValueChange={(value) => {
                        setSemester(value);
                        setError("");
                      }}
                    >
                      <SelectTrigger aria-label={text("الترم", "Semester")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent dir={ar ? "rtl" : "ltr"}>
                        {["first", "second", "summer"].map((value, index) => (
                          <SelectItem key={value} value={value}>
                            {
                              [
                                text("الأول", "First"),
                                text("الثاني", "Second"),
                                text("الصيفي", "Summer"),
                              ][index]
                            }
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {!validTerm ? (
                  <p role="alert" className="text-sm text-destructive">
                    {text(
                      "أدخل سنة دراسية صحيحة، مثل 2026-2027.",
                      "Enter a valid academic year, such as 2026-2027.",
                    )}
                  </p>
                ) : detail.isPending || detail.isFetching ? (
                  loading
                ) : detail.isError ? (
                  <p role="alert">{getApiErrorMessage(detail.error)}</p>
                ) : (
                  detail.data && (
                    <>
                      {!editable && (
                        <p
                          role="alert"
                          className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"
                        >
                          {text(
                            "التسجيل الحالي قيد المراجعة أو مرفوض. أنهِ مراجعته من صفحة التسجيل قبل التعديل هنا.",
                            "This registration is pending or rejected. Resolve it on the Registration page before editing here.",
                          )}
                        </p>
                      )}
                      <section
                        aria-label={text(
                          "المواد المسجلة",
                          "Registered courses",
                        )}
                        className="space-y-2"
                      >
                        <div className="flex flex-wrap justify-between gap-2">
                          <h3 className="flex items-center gap-2 text-sm font-bold">
                            <BookOpen className="size-4 text-primary" />
                            {text("المواد المسجلة", "Registered courses")} (
                            {detail.data.courses.length})
                          </h3>
                          <span className="text-xs text-muted-foreground">
                            {detail.data.totalCreditHours}{" "}
                            {text("ساعة معتمدة", "credit hours")}
                          </span>
                        </div>
                        {!detail.data.courses.length && (
                          <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
                            {text(
                              "لا توجد مواد مسجلة في هذا الترم.",
                              "No courses registered for this term.",
                            )}
                          </p>
                        )}
                        <div className="grid gap-2 sm:grid-cols-2">
                          {detail.data.courses.map((course) => (
                            <div
                              key={course.code}
                              className="flex min-w-0 items-center justify-between gap-2 rounded-xl border p-3"
                            >
                              <div className="min-w-0">
                                <p className="break-words text-sm font-medium">
                                  {courseName(course)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  <bdi>{course.code}</bdi> ·{" "}
                                  {course.creditHours ?? "—"}{" "}
                                  {text("ساعة", "credits")}
                                </p>
                              </div>
                              <Menu.Root dir={ar ? "rtl" : "ltr"}>
                                <Menu.Trigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={
                                      mutation.isPending ||
                                      !editable ||
                                      !course._id
                                    }
                                    aria-label={
                                      text(
                                        "إجراءات المادة ",
                                        "Course actions ",
                                      ) + course.code
                                    }
                                  >
                                    <MoreVertical className="size-4" />
                                  </Button>
                                </Menu.Trigger>
                                <Menu.Portal>
                                  <Menu.Content asChild>
                                    <div
                                      dir={ar ? "rtl" : "ltr"}
                                      className="z-[100] min-w-36 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
                                    >
                                      <Menu.Item
                                        className="cursor-pointer rounded-lg p-2 text-sm text-destructive outline-none focus:bg-destructive/10"
                                        onSelect={() =>
                                          setConfirmation({
                                            action: "withdraw",
                                            course,
                                          })
                                        }
                                      >
                                        {text("سحب المادة", "Withdraw course")}
                                      </Menu.Item>
                                    </div>
                                  </Menu.Content>
                                </Menu.Portal>
                              </Menu.Root>
                            </div>
                          ))}
                        </div>
                      </section>
                      {editable && (
                        <section
                          className="space-y-2 border-t pt-3"
                          aria-label={text("إضافة مادة", "Add a course")}
                        >
                          <h3 className="text-sm font-bold">
                            {text("إضافة مادة", "Add a course")}
                          </h3>
                          <Input
                            value={courseSearch}
                            maxLength={100}
                            onChange={(event) =>
                              setCourseSearch(event.target.value)
                            }
                            aria-label={text(
                              "بحث المادة بالكود أو الاسم",
                              "Search course code or name",
                            )}
                            placeholder={text(
                              "ابحث بكود المادة أو اسمها…",
                              "Search course code or name…",
                            )}
                          />
                          {available.isFetching ? (
                            loading
                          ) : available.isError ? (
                            <p role="alert">
                              {getApiErrorMessage(available.error)}
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {available.data?.items.map((course) => (
                                <div
                                  key={course._id}
                                  className="flex items-center justify-between gap-3 rounded-xl border p-3"
                                >
                                  <div className="min-w-0">
                                    <p className="break-words text-sm font-medium">
                                      {courseName(course)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      <bdi>{course.code}</bdi> ·{" "}
                                      {text("المستوى", "Level")} {course.level}{" "}
                                      · {course.creditHours}{" "}
                                      {text("ساعة", "credits")}
                                    </p>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={mutation.isPending}
                                    onClick={() =>
                                      setConfirmation({ action: "add", course })
                                    }
                                  >
                                    <Plus className="size-4" />
                                    {text("إضافة", "Add")}
                                  </Button>
                                </div>
                              ))}
                              {!available.data?.items.length && (
                                <p className="py-4 text-center text-sm text-muted-foreground">
                                  {text(
                                    "لا توجد مواد متاحة تطابق البحث والترم.",
                                    "No available courses match this search and term.",
                                  )}
                                </p>
                              )}
                              {available.data?.hasMore && (
                                <p className="text-xs text-muted-foreground">
                                  {text(
                                    "حدد البحث لعرض مواد أخرى.",
                                    "Refine your search to see other courses.",
                                  )}
                                </p>
                              )}
                            </div>
                          )}
                        </section>
                      )}
                    </>
                  )
                )}
                {error && (
                  <p
                    role="alert"
                    className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                  >
                    {error}
                  </p>
                )}
              </>
            )}
          </div>
          <div className="flex border-t pt-3">
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={onClose}
            >
              <X className="size-4" />
              {text("إغلاق", "Close")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        dir={ar ? "rtl" : "ltr"}
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
        title={
          confirmation?.action === "withdraw"
            ? text("سحب المادة من الطالب؟", "Withdraw this course?")
            : text("تسجيل المادة للطالب؟", "Enroll this student?")
        }
        description={
          <>
            {student && name(student)} · <bdi>{student?.studentCode}</bdi>
            <br />
            {confirmation && courseName(confirmation.course)} ·{" "}
            <bdi>{confirmation?.course.code}</bdi>
            <br />
            <bdi>{academicYear}</bdi> ·{" "}
            {text("الترم المحدد أعلاه", "The semester selected above")}
            <br />
            {confirmation?.action === "withdraw"
              ? text(
                  "سيُلغى التسجيل في هذه المادة فقط. درجات الطالب ستظل محفوظة.",
                  "Only this course registration is removed. Student grades are preserved.",
                )
              : text(
                  "تُطبق قواعد التسجيل الحالية للقسم والترم والمتطلبات وحدود الساعات.",
                  "Existing department, term, prerequisite and credit-limit rules apply.",
                )}
          </>
        }
        destructive={confirmation?.action === "withdraw"}
        confirmLabel={text("تأكيد", "Confirm")}
        cancelLabel={text("إلغاء", "Cancel")}
        disabled={mutation.isPending || !detail.data}
        onConfirm={() => {
          if (!confirmation?.course._id || !detail.data) return;
          mutation.mutate({
            action: confirmation.action,
            courseId: confirmation.course._id,
            expectedVersion: detail.data.version,
          });
          setConfirmation(null);
        }}
      />
    </>
  );
}
