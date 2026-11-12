"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ControlSchemeComponent, Semester } from "@student-portal/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { getApiErrorMessage } from "@/lib/api";
import { controlKeys, getGradingScheme, updateGradingScheme } from "../api";
import { ControlHelpNotes } from "./control-help-notes";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  academicYear: string;
  semester: Semester;
  locale: string;
  onSaved?: () => void;
}
export function GradingSchemeDialog({
  open,
  onOpenChange,
  courseId,
  courseCode,
  courseTitle,
  academicYear,
  semester,
  locale,
  onSaved,
}: Props) {
  const t = useTranslations("control");
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: controlKeys.scheme(courseId, academicYear, semester),
    queryFn: () => getGradingScheme(courseId, { academicYear, semester }),
    enabled: open,
    refetchOnWindowFocus: false,
  });
  const [previous, setPrevious] = useState(data);
  const [components, setComponents] = useState<ControlSchemeComponent[]>(
    () => data?.components.map((component) => ({ ...component })) ?? [],
  );
  const [attendanceMax, setAttendanceMax] = useState(
    data?.courseworkAttendanceMax ?? 5,
  );
  if (data && data !== previous) {
    setPrevious(data);
    setComponents(data.components.map((c) => ({ ...c })));
    setAttendanceMax(data.courseworkAttendanceMax);
  }
  const save = useMutation({
    mutationFn: () =>
      updateGradingScheme(courseId, {
        academicYear,
        semester,
        components,
        courseworkAttendanceMax: attendanceMax,
      }),
    onSuccess: () => {
      toast.success(t("saved"));
      void queryClient.invalidateQueries({ queryKey: controlKeys.all });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
  const invalidScheme =
    components.length !== 3 ||
    components.some(
      (component) =>
        !Number.isFinite(component.max) ||
        !Number.isFinite(component.step) ||
        component.max <= 0 ||
        component.max > 1000 ||
        component.step <= 0 ||
        component.step > component.max ||
        Math.abs(component.max * 100 - Math.round(component.max * 100)) >
          1e-8 ||
        Math.abs(component.step * 100 - Math.round(component.step * 100)) >
          1e-8,
    );
  const invalidAttendance =
    !Number.isFinite(attendanceMax) ||
    attendanceMax < 0 ||
    attendanceMax > 20 ||
    Math.abs(attendanceMax * 100 - Math.round(attendanceMax * 100)) > 1e-8;
  function changeOpen(next: boolean) {
    if (save.isPending) return;
    if (!next) {
      setComponents(
        data?.components.map((component) => ({ ...component })) ?? [],
      );
      setAttendanceMax(data?.courseworkAttendanceMax ?? 5);
      save.reset();
    }
    onOpenChange(next);
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        dir={locale === "ar" ? "rtl" : "ltr"}
        className="flex flex-col rounded-2xl max-w-xl max-h-[90dvh] overflow-hidden"
      >
        <DialogHeader>
          <DialogTitle className="text-start">
            {t("scheme")} <bdi>{courseCode}</bdi>
          </DialogTitle>
          <DialogDescription className="text-start">
            {courseTitle}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p>{t("loading")}</p>
        ) : error ? (
          <div role="alert">
            <p>{getApiErrorMessage(error)}</p>
            <Button variant="outline" onClick={() => void refetch()}>
              {t("retry")}
            </Button>
          </div>
        ) : (
          <div className="min-h-0 space-y-4 overflow-y-auto">
            <ControlHelpNotes scheme />
            <Label htmlFor="control-attendance-max">{t("attendanceMax")}</Label>
            <Input
              id="control-attendance-max"
              dir="ltr"
              type="number"
              min={0}
              max={20}
              step={0.5}
              value={Number.isFinite(attendanceMax) ? attendanceMax : ""}
              aria-invalid={invalidAttendance}
              onChange={(e) =>
                setAttendanceMax(
                  e.target.value === "" ? NaN : Number(e.target.value),
                )
              }
            />
            {!invalidAttendance && (
              <p
                role="status"
                aria-live="polite"
                className="text-xs text-primary"
              >
                {t("courseworkNote", {
                  attendance: attendanceMax,
                  quizzes: 20 - attendanceMax,
                })}
              </p>
            )}
            {components.map((component) => (
              <div
                key={component.key}
                className="rounded-xl border p-3 space-y-2"
              >
                <h3 className="font-semibold">{t(component.key)}</h3>
                <Label className="flex items-center gap-2">
                  <Checkbox
                    checked={component.enabled}
                    onCheckedChange={(enabled) =>
                      setComponents((current) =>
                        current.map((c) =>
                          c.key === component.key
                            ? { ...c, enabled: enabled === true }
                            : c,
                        ),
                      )
                    }
                  />
                  {t("enabled")}
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  {(["max", "step"] as const).map((field) => (
                    <div key={field}>
                      <Label htmlFor={`${component.key}-${field}`}>
                        {t(field === "max" ? "maximum" : "step")}
                      </Label>
                      <Input
                        id={`${component.key}-${field}`}
                        dir="ltr"
                        type="number"
                        min={0.01}
                        max={1000}
                        aria-invalid={
                          !Number.isFinite(component[field]) ||
                          component[field] <= 0 ||
                          component[field] > 1000 ||
                          component.step > component.max
                        }
                        step={0.01}
                        disabled={
                          field === "max" && component.key === "coursework"
                        }
                        value={
                          Number.isFinite(component[field])
                            ? component[field]
                            : ""
                        }
                        onChange={(e) =>
                          setComponents((current) =>
                            current.map((c) =>
                              c.key === component.key
                                ? {
                                    ...c,
                                    [field]:
                                      e.target.value === ""
                                        ? NaN
                                        : Number(e.target.value),
                                  }
                                : c,
                            ),
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {(invalidScheme || invalidAttendance) && !isLoading && (
          <p role="alert" className="text-sm text-destructive">
            {t("schemeValidation")}
          </p>
        )}
        {save.isError && (
          <p role="alert" className="text-sm text-destructive">
            {getApiErrorMessage(save.error)}
          </p>
        )}
        <DialogFooter className="shrink-0 rtl:sm:justify-start">
          <Button
            variant="outline"
            disabled={save.isPending}
            onClick={() => changeOpen(false)}
          >
            {t("cancel")}
          </Button>
          <Button
            disabled={
              isLoading ||
              Boolean(error) ||
              save.isPending ||
              invalidScheme ||
              invalidAttendance ||
              !Number.isFinite(attendanceMax) ||
              attendanceMax < 0 ||
              attendanceMax > 20
            }
            onClick={() => save.mutate()}
          >
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
