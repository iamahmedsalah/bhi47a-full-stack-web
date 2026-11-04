"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { getStaffCourseChoices, getStaffFormCourses } from "../api";
import { StaffPermissionFields } from "./staff-permission-fields";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Loader2,
  Sparkles,
  User,
  Mail,
  Shield,
  Phone,
  KeyRound,
  AtSign,
  GraduationCap,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  STAFF_TYPE_VALUES,
  PERMISSIONS,
  STAFF_TYPE_DEFAULT_PERMISSIONS,
  DOCTOR_PREFIX_VALUES,
  inferDoctorPrefix,
  stripStaffTitlePrefix,
  type StaffType,
  type DoctorPrefix,
  type Permission,
} from "@student-portal/shared";
import { useAuth } from "@/providers/auth-provider";
import { getApiErrorDetails } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createStaffFormSchema, type StaffFormValues } from "../schema";
import { staffFormError } from "../form-errors";
import type { StaffMember } from "../types";

interface Props {
  open: boolean;
  staff: StaffMember | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: StaffFormValues) => Promise<void>;
}

export function StaffFormDialog({
  open,
  staff,
  pending,
  onOpenChange,
  onSubmit,
}: Props) {
  const t = useTranslations("staff");
  const locale = useLocale();
  const isAr = locale === "ar";
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [courseSearch, setCourseSearch] = useState("");
  const [courseLevel, setCourseLevel] = useState("all");
  const canManageStaff =
    isAdmin ||
    (user?.role === "staff" &&
      user.permissions?.includes(PERMISSIONS.STAFF_CREATE_ACADEMIC) === true);
  const allowedStaffTypes = useMemo<StaffType[]>(
    () =>
      isAdmin
        ? (STAFF_TYPE_VALUES as unknown as StaffType[])
        : ["doctor", "teaching_assistant", "assistant_lecturer"],
    [isAdmin],
  );

  const schema = useMemo(
    () => createStaffFormSchema((key) => t(`validation.${key}`)),
    [t],
  );
  const form = useForm<StaffFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      nameAr: "",
      email: "",
      username: "",
      phone: "",
      password: "",
      role: "staff",
      staffType: "doctor",
      titlePrefix: "dr",
      isCreate: true,
    },
  });

  const explicitTitle = useRef(false);
  const selectedRole = form.watch("role");
  const selectedType = form.watch("staffType");
  const selectedCourses = form.watch("courseIds") ?? [];
  const teaching =
    selectedRole === "staff" &&
    ["doctor", "teaching_assistant", "assistant_lecturer"].includes(
      selectedType,
    );
  const courseChoices = useQuery({
    queryKey: ["staff-course-choices"],
    queryFn: getStaffCourseChoices,
    enabled: open && canManageStaff && selectedRole === "staff",
  });
  const assignments = useQuery({
    queryKey: ["staff-form-courses", staff?._id],
    queryFn: () => getStaffFormCourses(staff!._id),
    enabled: open && canManageStaff && Boolean(staff && staff.role === "staff"),
    staleTime: 0,
  });
  const visibleCourses = (courseChoices.data ?? []).filter((course) =>
    (courseLevel === "all" || course.level === courseLevel) &&
    [course.code, course.name, course.nameAr, course.nameEn].some((value) =>
      value?.toLocaleLowerCase().includes(courseSearch.trim().toLocaleLowerCase()),
    ),
  );

  useEffect(() => {
    if (!open) return;
    setCourseSearch("");
    setCourseLevel("all");
    const initialStaffType =
      (staff?.staffType as StaffType) ?? allowedStaffTypes[0] ?? "doctor";
    const initialTitlePrefix =
      (staff?.titlePrefix as DoctorPrefix) ||
      inferDoctorPrefix(staff?.nameAr) ||
      inferDoctorPrefix(staff?.name) ||
      (initialStaffType === "doctor" ? "dr" : undefined);

    explicitTitle.current = Boolean(staff?.titlePrefix);
    form.reset({
      name: staff?.name ?? "",
      nameAr: staff?.nameAr ?? "",
      email: staff?.email ?? "",
      username: staff?.username ?? "",
      phone: staff?.phone ?? "",
      password: "",
      role: staff?.role ?? "staff",
      staffType: initialStaffType,
      titlePrefix: initialTitlePrefix,
      isCreate: !staff,
      courseIds: staff ? undefined : [],
      permissions: staff?.permissions ?? [
        ...STAFF_TYPE_DEFAULT_PERMISSIONS[allowedStaffTypes[0] ?? "doctor"],
      ],
    });
  }, [form, open, staff, allowedStaffTypes]);

  useEffect(() => {
    if (
      open &&
      staff &&
      assignments.data &&
      !form.getFieldState("courseIds").isDirty
    )
      form.setValue(
        "courseIds",
        assignments.data.map((course) => course._id),
      );
  }, [open, staff, assignments.data, form]);

  const save = async (values: StaffFormValues) => {
    form.clearErrors("root");
    try {
      await onSubmit({
        ...values,
        titlePrefix:
          values.staffType === "doctor"
            ? values.titlePrefix || "dr"
            : undefined,
        courseIds: teaching ? values.courseIds : [],
      });
    } catch (error) {
      const failure = staffFormError(getApiErrorDetails(error));
      let first = true;
      for (const [field, key] of Object.entries(failure.fields)) {
        form.setError(
          field as keyof StaffFormValues,
          { type: "server", message: t(`validation.${key}`) },
          { shouldFocus: first },
        );
        first = false;
      }
      const message = t(`validation.${failure.message}`);
      form.setError("root.server", { type: "server", message });
      toast.error(message, { id: "staff-profile-save" });
    }
  };

  const generateRandomPassword = () => {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
    let pwd = "BHI@";
    for (let i = 0; i < 6; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    pwd += "2026";
    form.setValue("password", pwd, { shouldValidate: true });
    toast.info(t("toasts.passwordGenerated"));
  };

  const handleEmailBlur = (emailVal: string) => {
    if (staff) return;
    const currentUsername = form.getValues("username");
    if (!currentUsername && emailVal.includes("@")) {
      const suggested = emailVal
        .split("@")[0]
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "");
      if (suggested.length >= 3) {
        form.setValue("username", suggested, { shouldValidate: true });
      }
    }
  };

  const handleNameBlur = (fieldName: "name" | "nameAr", rawValue: string) => {
    if (!rawValue) return;
    const detectedPrefix = inferDoctorPrefix(rawValue);
    if (
      detectedPrefix &&
      !explicitTitle.current &&
      form.getValues("staffType") === "doctor"
    ) {
      form.setValue("titlePrefix", detectedPrefix, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
    const cleaned = stripStaffTitlePrefix(rawValue);
    if (cleaned !== rawValue) {
      form.setValue(fieldName, cleaned, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-card/95 p-6 shadow-2xl backdrop-blur-xl"
      >
        <DialogHeader className="border-b border-border/70 pb-3 text-start">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
            <User className="h-5 w-5 text-primary" />
            <span>{staff ? t("editTitle") : t("createTitle")}</span>
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            noValidate
            onSubmit={form.handleSubmit(save)}
            className="space-y-4 pt-2"
          >
            {form.formState.errors.root?.server?.message && (
              <div
                role="alert"
                className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
              >
                {form.formState.errors.root.server.message}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Arabic Name */}
              <FormField
                control={form.control}
                name="nameAr"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5 text-xs font-semibold">
                      <User className="h-3.5 w-3.5 text-primary" />
                      {t("fields.nameAr")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("placeholders.nameAr")}
                        className="rounded-squircle border-white/15 bg-background/60 text-sm"
                        dir="rtl"
                        {...field}
                        onBlur={(e) => {
                          field.onBlur();
                          handleNameBlur("nameAr", e.target.value);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Full Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5 text-xs font-semibold">
                      <User className="h-3.5 w-3.5 text-primary" />
                      {t("fields.name")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("placeholders.name")}
                        className="rounded-squircle border-white/15 bg-background/60 text-sm"
                        {...field}
                        onBlur={(e) => {
                          field.onBlur();
                          handleNameBlur("name", e.target.value);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Account Role (Only selectable by Admin during creation) */}
              {isAdmin && !staff && (
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5 text-xs font-semibold">
                        <Shield className="h-3.5 w-3.5 text-primary" />
                        {isAr ? "نوع الحساب" : "Account Role"}
                      </FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger className="rounded-squircle border-white/15 bg-background/60 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent dir={isAr ? "rtl" : "ltr"}>
                          <SelectItem value="staff">
                            {isAr
                              ? "حساب كادر (أكاديمي / إداري)"
                              : "Staff Account"}
                          </SelectItem>
                          <SelectItem value="admin">
                            {isAr
                              ? "مدير نظام (Administrator)"
                              : "System Administrator"}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Staff Type (Only when role is staff) */}
              {selectedRole !== "admin" && (
                <FormField
                  control={form.control}
                  name="staffType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5 text-xs font-semibold">
                        <Shield className="h-3.5 w-3.5 text-primary" />
                        {t("fields.staffType")}
                      </FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          if (
                            value === "doctor" &&
                            !form.getValues("titlePrefix")
                          ) {
                            form.setValue("titlePrefix", "dr");
                          }
                          if (!staff)
                            form.setValue("permissions", [
                              ...STAFF_TYPE_DEFAULT_PERMISSIONS[
                                value as StaffType
                              ],
                            ]);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger aria-label={t("fields.staffType")} className="rounded-squircle border-white/15 bg-background/60 text-sm">
                            <SelectValue
                              placeholder={t("fields.selectStaffType")}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent dir={isAr ? "rtl" : "ltr"}>
                          {allowedStaffTypes.map((type) => (
                            <SelectItem key={type} value={type}>
                              {t(`types.${type}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Doctor Academic Title Prefix (Only when staffType is doctor) */}
              {selectedRole !== "admin" && selectedType === "doctor" && (
                <FormField
                  control={form.control}
                  name="titlePrefix"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5 text-xs font-semibold">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        {t("fields.titlePrefix")}
                      </FormLabel>
                      <Select
                        value={field.value || "dr"}
                        onValueChange={(value) => {
                          explicitTitle.current = true;
                          field.onChange(value);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger aria-label={t("fields.titlePrefix")} className="rounded-squircle border-white/15 bg-background/60 text-sm">
                            <SelectValue
                              placeholder={t("fields.selectTitlePrefix")}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent dir={isAr ? "rtl" : "ltr"}>
                          {DOCTOR_PREFIX_VALUES.map((prefix) => (
                            <SelectItem key={prefix} value={prefix}>
                              {t(`doctorPrefixes.${prefix}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Email Address */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5 text-xs font-semibold">
                      <Mail className="h-3.5 w-3.5 text-primary" />
                      {t("fields.email")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        dir="ltr"
                        placeholder={t("placeholders.email")}
                        className="rounded-squircle border-white/15 bg-background/60 text-sm text-left"
                        {...field}
                        onBlur={(e) => {
                          field.onBlur();
                          handleEmailBlur(e.target.value);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Username (Primary for login) */}
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center justify-between text-xs font-semibold">
                      <span className="flex items-center gap-1.5">
                        <AtSign className="h-3.5 w-3.5 text-primary" />
                        {t("fields.username")}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-normal">
                        {t("fields.primaryLoginHint")}
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        dir="ltr"
                        placeholder={t("placeholders.username")}
                        className="rounded-squircle border-white/15 bg-background/60 text-sm font-mono text-left"
                        {...field}
                      />
                    </FormControl>
                    <p className="text-[11px] text-muted-foreground">
                      {t("fields.usernameHelp")}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Phone */}
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel className="flex items-center gap-1.5 text-xs font-semibold">
                      <Phone className="h-3.5 w-3.5 text-primary" />
                      {t("fields.phone")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        dir="ltr"
                        placeholder={t("placeholders.phone")}
                        className="rounded-squircle border-white/15 bg-background/60 text-sm text-left"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Password (for creation) */}
            {!staff && (
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem className="rounded-xl border border-white/10 bg-secondary/30 p-3.5">
                    <div className="flex items-center justify-between pb-1">
                      <FormLabel className="flex items-center gap-1.5 text-xs font-semibold">
                        <KeyRound className="h-3.5 w-3.5 text-primary" />
                        {t("fields.temporaryPassword")}
                      </FormLabel>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={generateRandomPassword}
                        className="h-7 text-xs text-primary hover:bg-primary/10 gap-1 rounded-squircle"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>{t("fields.generatePassword")}</span>
                      </Button>
                    </div>
                    <FormControl>
                      <PasswordInput
                        dir="ltr"
                        autoComplete="new-password"
                        placeholder="••••••••••••"
                        className="rounded-squircle border-white/15 bg-background/60 text-sm font-mono text-left"
                        {...field}
                      />
                    </FormControl>
                    <p className="text-[11px] text-muted-foreground pt-1">
                      {t("fields.passwordHelp")}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {canManageStaff && selectedRole === "staff" && (
              <>
                {teaching && (
                  <fieldset className="space-y-3 rounded-xl border border-border/80 bg-card/60 p-4">
                    <legend className="flex items-center gap-1.5 px-1.5 text-sm font-bold text-foreground">
                      <GraduationCap className="h-4 w-4 text-primary" />
                      <span>{t("details.assignedCoursesTitle")}</span>
                    </legend>
                    <p className="text-xs text-muted-foreground">
                      {t("details.assignedCoursesDescription")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Input aria-label={isAr ? "البحث عن مقرر" : "Search courses"} placeholder={isAr ? "ابحث بالاسم أو الكود" : "Search by name or code"} value={courseSearch} onChange={(event) => setCourseSearch(event.target.value)} className="flex-1 rounded-squircle" />
                      <Select value={courseLevel} onValueChange={setCourseLevel}>
                        <SelectTrigger aria-label={isAr ? "المستوى" : "Level"} className="w-40 rounded-squircle"><SelectValue /></SelectTrigger>
                        <SelectContent dir={isAr ? "rtl" : "ltr"}>
                          <SelectItem value="all">{isAr ? "كل المستويات" : "All levels"}</SelectItem>
                          {Array.from(new Set((courseChoices.data ?? []).map((course) => course.level).filter((level): level is string => Boolean(level)))).sort().map((level) => <SelectItem key={level} value={level}>{isAr ? `المستوى ${level}` : `Level ${level}`}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {courseChoices.isLoading ||
                    (staff && assignments.isLoading) ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : courseChoices.isError ||
                      (staff && assignments.isError) ? (
                      <div role="alert" className="space-y-2">
                        <p className="text-sm text-danger">
                          {t("toasts.failed")}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-squircle text-xs"
                          onClick={() => {
                            void courseChoices.refetch();
                            if (staff) void assignments.refetch();
                          }}
                        >
                          {t("retry")}
                        </Button>
                      </div>
                    ) : (
                      <div className="max-h-56 space-y-2 overflow-y-auto pe-1">
                        {visibleCourses.map((course) => {
                          const isSelected = selectedCourses.includes(
                            course._id,
                          );
                          return (
                            <label
                              key={course._id}
                              className={`flex cursor-pointer items-center gap-2.5 rounded-squircle border p-2.5 text-xs transition-all select-none ${
                                isSelected
                                  ? "border-primary/50 bg-primary/10 text-foreground shadow-xs"
                                  : "border-border/60 bg-background/40 hover:border-border hover:bg-secondary/30 text-muted-foreground"
                              }`}
                            >
                              <Checkbox
                                disabled={pending}
                                checked={isSelected}
                                onCheckedChange={(checked) =>
                                  form.setValue(
                                    "courseIds",
                                    checked === true
                                      ? [...selectedCourses, course._id]
                                      : selectedCourses.filter(
                                          (id) => id !== course._id,
                                        ),
                                    { shouldDirty: true, shouldValidate: true },
                                  )
                                }
                              />
                              <bdi className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-squircle border border-primary/20">
                                {course.code}
                              </bdi>
                              <span className="font-medium flex-1">
                                {isAr
                                  ? course.nameAr || course.name
                                  : course.nameEn || course.name}
                              </span>
                            </label>
                          );
                        })}
                        {visibleCourses.length === 0 && (
                          <p className="text-sm text-muted-foreground">
                            {t("details.noCourses")}
                          </p>
                        )}
                      </div>
                    )}
                    <FormMessage>
                      {form.formState.errors.courseIds?.message}
                    </FormMessage>
                  </fieldset>
                )}
                {isAdmin && <StaffPermissionFields
                  value={(form.watch("permissions") ?? []) as Permission[]}
                  currentStaffType={selectedType as StaffType}
                  onChange={(value) =>
                    form.setValue("permissions", value, { shouldDirty: true })
                  }
                  disabled={pending}
                />}
              </>
            )}
            <DialogFooter className="mt-6 gap-2 border-t border-border/70 pt-4 rtl:sm:justify-start">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-squircle"
              >
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={
                  pending ||
                  (canManageStaff &&
                    teaching &&
                    (courseChoices.isPending ||
                      courseChoices.isError ||
                      Boolean(
                        staff && (assignments.isPending || assignments.isError),
                      )))
                }
                className="rounded-squircle gap-2 bg-primary font-semibold text-white hover:bg-primary-hover"
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {staff ? t("save") : t("create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
