"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import * as Select from "@radix-ui/react-select";
import { UNGROUPED } from "./timetable-model";

export function ScheduleGroupFilter({
  value,
  groups,
  onChange,
}: {
  value: string;
  groups: readonly string[];
  onChange: (value: string) => void;
}) {
  const t = useTranslations("courseTimetable");
  const locale = useLocale();
  const options =
    value !== "all" && !groups.includes(value) ? [...groups, value] : groups;
  return (
    <Select.Root
      value={value}
      onValueChange={onChange}
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <Select.Trigger
        aria-label={t("groupFilter")}
        className="flex h-9 w-full min-w-36 cursor-pointer items-center justify-between gap-2 rounded-squircle border border-border bg-background px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Select.Value placeholder={t("allGroups")} />
        <Select.Icon>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          dir={locale === "ar" ? "rtl" : "ltr"}
          position="popper"
          sideOffset={5}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl"
        >
          <Select.Viewport>
            {[
              { value: "all", label: t("allGroups") },
              ...options.map((group) => ({
                value: group,
                label:
                  group === UNGROUPED ? t("ungrouped") : t("group", { group }),
              })),
            ].map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                className="relative flex cursor-pointer items-center gap-2 rounded-squircle py-2 pe-8 ps-3 text-start text-xs outline-none data-[highlighted]:bg-secondary"
              >
                <Select.ItemText>
                  <bdi>{option.label}</bdi>
                </Select.ItemText>
                <Select.ItemIndicator className="absolute end-2">
                  <Check className="size-3.5 text-primary" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export function ScheduleSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("courseTimetable");
  const [draft, setDraft] = useState(value);
  const [previous, setPrevious] = useState(value);
  // Reconcile external URL changes, preserving a trailing space while typing.
  if (previous !== value) {
    setPrevious(value);
    if (draft.trim() !== value) setDraft(value);
  }
  useEffect(() => {
    const timer = setTimeout(() => onChange(draft), 300);
    return () => clearTimeout(timer);
  }, [draft, onChange]);
  return (
    <div className="relative min-w-0 flex-1 basis-60">
      <Search
        className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        aria-label={t("search")}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={t("search")}
        className="rounded-squircle ps-9 text-xs"
      />
    </div>
  );
}
