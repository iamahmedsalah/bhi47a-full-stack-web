"use client";

import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export function QuizRandomizationControls({
  enabled,
  mcqCount,
  trueFalseCount,
  bankSize,
  onEnabledChange,
  onMcqChange,
  onTrueFalseChange,
}: {
  enabled: boolean;
  mcqCount: number;
  trueFalseCount: number;
  bankSize: number;
  onEnabledChange: (enabled: boolean) => void;
  onMcqChange: (count: number) => void;
  onTrueFalseChange: (count: number) => void;
}) {
  const t = useTranslations("quizRandomization");
  return (
    <fieldset className="space-y-3 rounded-xl border border-border p-4">
      <legend className="px-2 text-sm font-bold">{t("title")}</legend>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={enabled}
          onCheckedChange={(value) => onEnabledChange(value === true)}
        />
        {t("enable")}
      </label>
      {enabled && (
        <>
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm">
              {t("mcq")}
              <Input
                dir="ltr"
                type="number"
                min={0}
                max={50}
                step={1}
                className="rounded-squircle text-left"
                value={mcqCount}
                onChange={(event) => onMcqChange(Number(event.target.value))}
              />
            </label>
            <label className="space-y-1 text-sm">
              {t("trueFalse")}
              <Input
                dir="ltr"
                type="number"
                min={0}
                max={50}
                step={1}
                className="rounded-squircle text-left"
                value={trueFalseCount}
                onChange={(event) =>
                  onTrueFalseChange(Number(event.target.value))
                }
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("summary", {
              selected: mcqCount + trueFalseCount,
              bank: bankSize,
              minimum: (mcqCount + trueFalseCount) * 3,
            })}
          </p>
        </>
      )}
    </fieldset>
  );
}
