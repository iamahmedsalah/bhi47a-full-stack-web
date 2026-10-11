"use client";

import { Toaster as Sonner, toast } from "sonner";
import { useTheme } from "@/providers/theme-provider";
import { useLocale } from "next-intl";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme, mounted } = useTheme();
  let locale = "ar";
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    locale = useLocale();
  } catch {
    // fallback if mounted outside NextIntlClientProvider
  }
  const isRtl = locale === "ar";

  return (
    <Sonner
      dir={isRtl ? "rtl" : "ltr"}
      theme={(mounted ? resolvedTheme : "light") as ToasterProps["theme"]}
      position="top-center"
      closeButton
      duration={4500}
      richColors={true}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:min-h-12 group-[.toaster]:px-4 group-[.toaster]:py-3 group-[.toaster]:pe-10 group-[.toaster]:rounded-squircle group-[.toaster]:backdrop-blur-xl group-[.toaster]:border group-[.toaster]:shadow-2xl text-sm font-semibold",
          success:
            "group-[.toast]:bg-emerald-500/10 group-[.toast]:text-emerald-950 dark:group-[.toast]:text-emerald-100 group-[.toast]:border-emerald-500/30 dark:group-[.toast]:bg-emerald-950/90 dark:group-[.toast]:border-emerald-500/40",
          error:
            "group-[.toast]:bg-red-500/10 group-[.toast]:text-red-950 dark:group-[.toast]:text-red-100 group-[.toast]:border-red-500/30 dark:group-[.toast]:bg-red-950/90 dark:group-[.toast]:border-red-500/40",
          warning:
            "group-[.toast]:bg-amber-500/10 group-[.toast]:text-amber-950 dark:group-[.toast]:text-amber-100 group-[.toast]:border-amber-500/30 dark:group-[.toast]:bg-amber-950/90 dark:group-[.toast]:border-amber-500/40",
          info:
            "group-[.toast]:bg-teal-500/10 group-[.toast]:text-teal-950 dark:group-[.toast]:text-teal-100 group-[.toast]:border-teal-500/30 dark:group-[.toast]:bg-teal-950/90 dark:group-[.toast]:border-teal-500/40",
          title: "group-[.toast]:text-sm group-[.toast]:font-bold",
          description: "group-[.toast]:text-xs group-[.toast]:font-medium opacity-90 mt-0.5 leading-relaxed",
          closeButton:
            "group-[.toast]:end-2.5 group-[.toast]:start-auto group-[.toast]:top-2.5 group-[.toast]:!transform-none group-[.toast]:h-5 group-[.toast]:w-5 group-[.toast]:bg-black/10 hover:group-[.toast]:bg-black/20 dark:group-[.toast]:bg-white/10 dark:hover:group-[.toast]:bg-white/20 group-[.toast]:border-none group-[.toast]:text-foreground group-[.toast]:rounded-full group-[.toast]:flex group-[.toast]:items-center group-[.toast]:justify-center transition-all",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
