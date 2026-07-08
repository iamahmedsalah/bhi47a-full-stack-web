"use client";

import { Toaster as Sonner, toast } from "sonner";
import { useTheme } from "@/providers/theme-provider";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme, mounted } = useTheme();

  return (
    <Sonner
      theme={(mounted ? resolvedTheme : "light") as ToasterProps["theme"]}
      position="top-center"
      closeButton
      duration={4000}
      richColors={true}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:min-h-12 group-[.toaster]:px-4 group-[.toaster]:py-3 group-[.toaster]:pe-10 group-[.toaster]:rounded-squircle group-[.toaster]:backdrop-blur-xl group-[.toaster]:border-border/80 group-[.toaster]:shadow-2xl text-sm font-semibold",
          success:
            "group-[.toast]:bg-emerald-950/90 group-[.toast]:text-emerald-200 group-[.toast]:border-emerald-500/40",
          error:
            "group-[.toast]:bg-red-950/90 group-[.toast]:text-red-200 group-[.toast]:border-red-500/40",
          warning:
            "group-[.toast]:bg-amber-950/90 group-[.toast]:text-amber-200 group-[.toast]:border-amber-500/40",
          info:
            "group-[.toast]:bg-blue-950/90 group-[.toast]:text-blue-200 group-[.toast]:border-blue-500/40",
          title: "group-[.toast]:text-sm group-[.toast]:font-bold",
          description: "group-[.toast]:text-xs group-[.toast]:font-medium",
          closeButton:
            "group-[.toast]:end-2.5 group-[.toast]:start-auto group-[.toast]:top-2.5 group-[.toast]:!transform-none group-[.toast]:h-5 group-[.toast]:w-5 group-[.toast]:bg-black/20 group-[.toast]:hover:bg-black/40 group-[.toast]:border-none group-[.toast]:text-foreground group-[.toast]:rounded-full group-[.toast]:flex group-[.toast]:items-center group-[.toast]:justify-center transition-all",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
