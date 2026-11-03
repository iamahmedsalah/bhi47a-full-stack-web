'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, SlidersHorizontal, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import type { ControlSchemeComponent, Semester } from '@student-portal/shared';
import { getApiErrorDetails, getApiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  controlKeys,
  getGradingScheme,
  updateGradingScheme,
} from '../api';

interface GradingSchemeDialogProps {
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
}: GradingSchemeDialogProps) {
  const isAr = locale === 'ar';
  const queryClient = useQueryClient();

  const { data: scheme, isLoading } = useQuery({
    queryKey: controlKeys.scheme(courseId, academicYear, semester),
    queryFn: () => getGradingScheme(courseId, { academicYear, semester }),
    enabled: open && Boolean(courseId),
  });

  const [components, setComponents] = useState<ControlSchemeComponent[]>([]);
  const [reason, setReason] = useState('');
  const [needsForce, setNeedsForce] = useState(false);
  const [prevScheme, setPrevScheme] = useState(scheme);

  if (prevScheme !== scheme && scheme?.components) {
    setPrevScheme(scheme);
    setComponents(scheme.components.map((c) => ({ ...c })));
    setNeedsForce(Boolean(scheme.frozenAt));
    setReason('');
  }

  const mutation = useMutation({
    mutationFn: () =>
      updateGradingScheme(courseId, {
        academicYear,
        semester,
        components: components.map(({ key, max, step, enabled }) => ({
          key,
          max: Number(max),
          step: Number(step),
          enabled,
        })),
        force: needsForce || undefined,
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(
        isAr
          ? 'تم حفظ توزيع الدرجات العظمى بنجاح'
          : 'Grading scheme saved successfully',
      );
      queryClient.invalidateQueries({ queryKey: controlKeys.all });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (err) => {
      const details = getApiErrorDetails(err);
      if (details.code === 'SCHEME_FROZEN') {
        setNeedsForce(true);
        toast.warning(
          isAr
            ? 'يوجد درجات مرصودة بالفعل؛ يرجى كتابة سبب التعديل للتأكيد'
            : 'Marks already exist; please provide a reason to confirm this change',
        );
        return;
      }
      toast.error(getApiErrorMessage(err));
    },
  });

  const updateComponentField = (
    key: ControlSchemeComponent['key'],
    field: 'max' | 'step',
    raw: string,
  ) => {
    const num = Number(raw);
    setComponents((prev) =>
      prev.map((c) =>
        c.key === key ? { ...c, [field]: Number.isFinite(num) ? num : 0 } : c,
      ),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isAr ? 'rtl' : 'ltr'}
        className="sm:max-w-lg rounded-2xl border-border/80 bg-card/95 backdrop-blur-xl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <SlidersHorizontal className="h-5 w-5 text-primary" />
            <span>
              {isAr ? 'ضبط الدرجات العظمى للمقرر' : 'Configure Course Maximum Marks'}
            </span>
          </DialogTitle>
          <DialogDescription>
            <bdi className="font-mono font-semibold text-foreground">{courseCode}</bdi>
            {' — '}
            {courseTitle} ({academicYear})
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {scheme?.frozenAt && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                <div>
                  {isAr
                    ? 'تم تجميد التوزيع لوجود درجات مرصودة. أي تعديل في الدرجة العظمى أو خطوة الرصد يتطلب سبباً مكتوباً ويُسجل في التدقيق.'
                    : 'Scheme is frozen because marks exist. Changing maximum mark or step requires a written reason and is audited.'}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {components.map((comp) => {
                const isMidterm = comp.key === 'midterm';
                return (
                  <div
                    key={comp.key}
                    className="rounded-xl border border-border/70 bg-surface/40 p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">
                        {isAr ? comp.nameAr : comp.nameEn}
                      </span>
                      <span className="rounded-squircle border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                        {isMidterm
                          ? isAr
                            ? 'مفعّل حالياً (المرحلة ١)'
                            : 'Active (Phase 1)'
                          : isAr
                            ? 'يُفعّل في المرحلة ٥'
                            : 'Phase 5'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          {isAr ? 'الدرجة العظمى (Max)' : 'Maximum Mark'}
                        </Label>
                        <Input
                          type="number"
                          step="0.5"
                          min="1"
                          max="1000"
                          dir="ltr"
                          className="text-left font-mono rounded-squircle h-9"
                          value={comp.max}
                          disabled={!isMidterm}
                          onChange={(e) =>
                            updateComponentField(comp.key, 'max', e.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          {isAr ? 'خطوة الرصد (Step)' : 'Allowed Step'}
                        </Label>
                        <Input
                          type="number"
                          step="0.25"
                          min="0.01"
                          max="10"
                          dir="ltr"
                          className="text-left font-mono rounded-squircle h-9"
                          value={comp.step}
                          disabled={!isMidterm}
                          onChange={(e) =>
                            updateComponentField(comp.key, 'step', e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {needsForce && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">
                  {isAr
                    ? 'سبب تعديل الدرجة العظمى بعد بدء الرصد (إجباري)'
                    : 'Reason for changing frozen scheme (required)'}
                </Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  className="rounded-squircle text-sm"
                  placeholder={
                    isAr
                      ? 'مثال: قرار مجلس القسم بتعديل الدرجة العظمى للميدتيرم...'
                      : 'e.g. Department council decision to update midterm maximum...'
                  }
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="rounded-squircle"
            onClick={() => onOpenChange(false)}
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button
            type="button"
            className="rounded-squircle"
            disabled={
              mutation.isPending ||
              isLoading ||
              (needsForce && reason.trim().length < 3)
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin me-1.5" />
            )}
            <span>{isAr ? 'حفظ الإعدادات' : 'Save Scheme'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
