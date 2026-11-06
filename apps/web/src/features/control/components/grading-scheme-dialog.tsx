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
  const { data, isLoading, error } = useQuery({
    queryKey: controlKeys.scheme(courseId, academicYear, semester),
    queryFn: () => getGradingScheme(courseId, { academicYear, semester }),
    enabled: open,
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={locale === "ar" ? "rtl" : "ltr"}
        className="rounded-2xl max-w-xl"
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
          <p role="alert">{getApiErrorMessage(error)}</p>
        ) : (
          <div className="space-y-4">
            <Label htmlFor="control-attendance-max">{t("attendanceMax")}</Label>
            <Input
              id="control-attendance-max"
              dir="ltr"
              type="number"
              min={0}
              max={20}
              step={0.5}
              value={attendanceMax}
              onChange={(e) => setAttendanceMax(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">{t("splitNote")}</p>
            <p className="text-xs text-muted-foreground">
              {t("calculationNote")}
            </p>
            <p className="text-xs text-muted-foreground">{t("frozenNote")}</p>
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
                        step={0.01}
                        disabled={
                          field === "max" && component.key === "coursework"
                        }
                        value={component[field]}
                        onChange={(e) =>
                          setComponents((current) =>
                            current.map((c) =>
                              c.key === component.key
                                ? { ...c, [field]: Number(e.target.value) }
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
        <DialogFooter className="rtl:sm:justify-start">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            disabled={
              isLoading ||
              Boolean(error) ||
              save.isPending ||
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
