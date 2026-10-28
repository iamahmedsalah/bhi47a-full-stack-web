"use client";

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";

function optionLabel(label: string) {
  const [code, ...name] = label.split(" · ");
  if (name.length) return <><bdi dir="ltr">{code}</bdi>{" · "}{name.join(" · ")}</>;
  return /^\d[\d-]*$/.test(label) ? <bdi dir="ltr">{label}</bdi> : label;
}

export function EnrollmentSelect({
  value,
  onValueChange,
  options,
  label,
  placeholder,
  disabled,
  locale,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  locale: string;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label;
  return (
    <Select.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <Select.Trigger
        aria-label={label}
        className="flex h-10 w-full min-w-0 items-center gap-2 rounded-squircle border border-border bg-card px-3 text-start text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 [&>span:first-child]:min-w-0 [&>span:first-child]:flex-1 [&>span:first-child]:truncate"
      >
        <Select.Value placeholder={placeholder}>
          {selectedLabel ? optionLabel(selectedLabel) : undefined}
        </Select.Value>
        <Select.Icon>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          dir={locale === "ar" ? "rtl" : "ltr"}
          className="z-[70] overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-xl"
          style={{
            width: "var(--radix-select-trigger-width)",
            maxHeight:
              "min(320px, var(--radix-select-content-available-height))",
          }}
        >
          <Select.Viewport className="max-h-72 overflow-y-auto p-1">
            {options.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                title={option.label}
                className="relative flex min-h-10 w-full min-w-0 cursor-pointer items-center gap-2 rounded-squircle px-3 py-2 text-start text-sm outline-none data-[highlighted]:bg-primary/10 data-[highlighted]:text-primary"
              >
                <Select.ItemIndicator className="shrink-0">
                  <Check className="h-4 w-4" />
                </Select.ItemIndicator>
                <Select.ItemText className="min-w-0 flex-1">
                  <span className="block whitespace-normal break-words leading-relaxed" dir="auto">
                    {optionLabel(option.label)}
                  </span>
                </Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
