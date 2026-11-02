"use client";
import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/providers/auth-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { MoreVertical } from "lucide-react";

export function useAdmissionUI() {
  const locale = useLocale(),
    t = useTranslations("admissionWorkflow"),
    { user } = useAuth();
  return {
    t,
    locale,
    dir: (locale === "ar" ? "rtl" : "ltr") as "rtl" | "ltr",
    can: (permission: string) =>
      user?.role === "admin" ||
      Boolean(user?.permissions?.includes(permission)),
    userId: user?._id,
    isAdmin: user?.role === "admin",
    date: (value: string) =>
      new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Cairo",
      }).format(new Date(value)),
  };
}
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {error && (
        <span role="alert" className="text-danger">
          {error}
        </span>
      )}
    </label>
  );
}
export function Choice({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  const { dir } = useAdmissionUI();
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger aria-label={label} className="rounded-squircle">
          <SelectValue />
        </SelectTrigger>
        <SelectContent dir={dir}>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
export function AdmissionDialog({
  open,
  onClose,
  title,
  children,
  description,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  description?: string;
}) {
  const { dir } = useAdmissionUI();
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent
        dir={dir}
        className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-2xl"
      >
        <DialogHeader className="text-start sm:text-start">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? undefined : "sr-only"}>
            {description ?? title}
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function AdmissionMenu({
  actions,
}: {
  actions: Array<{
    label: string;
    onClick: () => void;
    disabled?: boolean;
    variant?: "default" | "destructive";
    icon?: ReactNode;
  }>;
}) {
  const { t, dir } = useAdmissionUI();
  return (
    <Menu.Root dir={dir}>
      <Menu.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("actions")}
          className="rounded-squircle"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          {...{ dir }}
          align="end"
          className="z-50 min-w-44 rounded-xl border bg-card p-1 shadow-xl"
        >
          {actions.map((action) => (
            <Menu.Item
              key={action.label}
              disabled={action.disabled}
              onSelect={action.onClick}
              className={`flex cursor-pointer items-center gap-2 rounded-squircle px-3 py-2 text-start text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40 ${
                action.variant === "destructive"
                  ? "text-danger hover:bg-danger/10 focus:bg-danger/10"
                  : "focus:bg-primary/15"
              }`}
            >
              {action.icon && (
                <span className="h-4 w-4 shrink-0">{action.icon}</span>
              )}
              <span className="flex-1">{action.label}</span>
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
export function AdmissionPagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  const { t } = useAdmissionUI();
  return (
    <div className="flex items-center justify-end gap-3 pt-2">
      <Button
        variant="outline"
        size="sm"
        className="rounded-squircle"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        {t("previous")}
      </Button>
      <span className="text-xs text-muted-foreground">
        <bdi>
          {page} / {Math.max(1, totalPages)}
        </bdi>
      </span>
      <Button
        variant="outline"
        size="sm"
        className="rounded-squircle"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        {t("next")}
      </Button>
    </div>
  );
}
export function AdmissionInput(props: React.ComponentProps<typeof Input>) {
  return (
    <Input {...props} className={`rounded-squircle ${props.className || ""}`} />
  );
}
