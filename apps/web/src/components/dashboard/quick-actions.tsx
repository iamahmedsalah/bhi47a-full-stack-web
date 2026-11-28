"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  getPortalSettings,
  settingsKeys,
  updatePortalSettings,
} from "@/features/settings/api";
import { getApiErrorMessage } from "@/lib/api";

interface QuickActionProps {
  title: string;
  icon: ReactNode;
  onClick: () => void;
  detail?: string;
  disabled?: boolean;
}

export function QuickAction({
  title,
  icon,
  onClick,
  detail,
  disabled,
}: QuickActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-xl border border-border/70 bg-card/85 px-3 py-2.5 text-start focus-visible:outline-2 focus-visible:outline-primary hover:border-primary/55 hover:bg-primary/5 disabled:cursor-wait disabled:opacity-60 motion-safe:transition-colors motion-safe:duration-150"
    >
      <div className="grid size-9 shrink-0 place-items-center rounded-squircle border border-primary/20 bg-primary/10 text-primary motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover:scale-105">
        {icon}
      </div>
      <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
        {title}
        {detail && (
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
            {detail}
          </span>
        )}
      </span>
      <ArrowUpRight
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground group-hover:text-primary motion-safe:transition-transform motion-safe:group-hover:-translate-y-0.5 rtl:-scale-x-100"
      />
    </button>
  );
}

export function StudentLoginShortcut({ locale }: { locale: string }) {
  const t = useTranslations("adminShortcuts");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [intent, setIntent] = useState<boolean | null>(null);
  const settings = useQuery({
    queryKey: settingsKeys.portalSettings,
    queryFn: getPortalSettings,
  });
  const active = Boolean(settings.data?.studentLoginMaintenance);
  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      updatePortalSettings(
        next
          ? { studentLoginMaintenance: true }
          : {
              studentLoginMaintenance: false,
              studentLoginMaintenanceEta: null,
              studentLoginMaintenanceMessage: null,
            },
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(settingsKeys.portalSettings, data);
      void queryClient.invalidateQueries({
        queryKey: settingsKeys.publicPortalSettings,
      });
      void queryClient.invalidateQueries({
        queryKey: ["student-login-maintenance-status"],
      });
      toast.success(
        t(data.studentLoginMaintenance ? "maintenanceActive" : "loginOpen"),
      );
    },
  });
  return (
    <div className="min-w-0">
      <QuickAction
        title={t("studentLogin")}
        detail={
          settings.isSuccess
            ? t(active ? "maintenanceActive" : "loginOpen")
            : undefined
        }
        disabled={settings.isPending || mutation.isPending}
        icon={<LockKeyhole className="size-4" />}
        onClick={() => {
          if (!settings.isSuccess) {
            router.push(`/${locale}/admin/settings?tab=portal`);
            return;
          }
          mutation.reset();
          setIntent(!active);
        }}
      />
      {mutation.isPending && (
        <p role="status" className="mt-1 px-1 text-xs text-muted-foreground">
          {t("saving")}
        </p>
      )}
      {mutation.isError && (
        <p role="alert" className="mt-1 px-1 text-xs text-danger">
          {getApiErrorMessage(mutation.error, t("maintenanceError"))}
        </p>
      )}
      <ConfirmDialog
        open={intent !== null}
        onOpenChange={(open) => {
          if (!open) setIntent(null);
        }}
        dir={locale === "ar" ? "rtl" : "ltr"}
        title={t(intent ? "closeLogin" : "openLogin")}
        description={t(intent ? "closeLoginHint" : "openLoginHint")}
        confirmLabel={t(intent ? "closeLogin" : "openLogin")}
        cancelLabel={t("cancel")}
        destructive={intent === true}
        disabled={mutation.isPending}
        onConfirm={() => {
          if (intent !== null) mutation.mutate(intent);
        }}
      />
    </div>
  );
}
