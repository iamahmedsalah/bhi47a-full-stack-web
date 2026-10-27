"use client";

import React, { useSyncExternalStore } from "react";
import { Toaster as Sonner, toast } from "sonner";
import { useTheme } from "@/providers/theme-provider";
import { useLocale, useTranslations } from "next-intl";
import {
  Check,
  CircleAlert,
  Info,
  LoaderCircle,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

function subscribeMobile(callback: () => void) {
  const query = window.matchMedia("(max-width: 639px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

const getMobileSnapshot = () => window.matchMedia("(max-width: 639px)").matches;
const getServerMobileSnapshot = () => false;

function ToastStatusIcon({
  icon: Icon,
  status,
}: {
  icon: LucideIcon;
  status: "success" | "error" | "warning" | "info" | "loading";
}) {
  return (
    <span className={`toast-status-icon toast-status-icon--${status}`} aria-hidden="true">
      <Icon size={20} strokeWidth={2.25} />
    </span>
  );
}

function Toaster({ ...props }: ToasterProps) {
  const { resolvedTheme, mounted } = useTheme();
  const locale = useLocale();
  const t = useTranslations();
  const isRtl = locale === "ar";

  const isMobile = useSyncExternalStore(
    subscribeMobile,
    getMobileSnapshot,
    getServerMobileSnapshot,
  );

  const responsivePosition: ToasterProps["position"] = isMobile
    ? "bottom-center"
    : isRtl
      ? "bottom-left"
      : "bottom-right";

  return (
    <Sonner
      dir={isRtl ? "rtl" : "ltr"}
      theme={mounted ? resolvedTheme : "light"}
      position={responsivePosition}
      closeButton
      duration={4500}
      className="toaster group"
      containerAriaLabel={t("studentPortal.notifications")}
      icons={{
        success: <ToastStatusIcon icon={Check} status="success" />,
        error: <ToastStatusIcon icon={CircleAlert} status="error" />,
        warning: <ToastStatusIcon icon={TriangleAlert} status="warning" />,
        info: <ToastStatusIcon icon={Info} status="info" />,
        loading: <ToastStatusIcon icon={LoaderCircle} status="loading" />,
        close: <X size={16} strokeWidth={2} aria-hidden="true" />,
      }}
      toastOptions={{
        closeButtonAriaLabel: t("common.close"),
        classNames: {
          toast: "group toast",
          actionButton:
            "!rounded-squircle !text-xs !font-bold !px-3 !py-1.5",
          cancelButton:
            "!rounded-squircle !text-xs !font-semibold",
        },
      }}
      {...props}
    />
  );
}

export { Toaster, toast };
