"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { AnimatePresence } from "framer-motion";
import LanguageSwitchOverlay from "@/components/ui/LanguageSwitchOverlay";

export type LanguagePref = "en" | "ar";

type LanguageContextValue = {
  language: LanguagePref;
  setLanguage: (language: LanguagePref) => Promise<void>;
  direction: "ltr" | "rtl";
  isLanguageChanging: boolean;
};

type LanguageProviderProps = {
  children: ReactNode;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined,
);

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const routeLocale = useLocale();
  const language: LanguagePref = routeLocale === "en" ? "en" : "ar";
  const [isLanguageChanging, setIsLanguageChanging] = useState(false);

  const [targetPath, setTargetPath] = useState<string | null>(null);
  const [targetLanguage, setTargetLanguage] = useState<LanguagePref | null>(
    null,
  );

  // Listen for route changes to dismiss the language switch overlay smoothly after route loads
  useEffect(() => {
    if (targetPath && pathname === targetPath) {
      const timeout = window.setTimeout(() => {
        setIsLanguageChanging(false);
        setTargetPath(null);
        setTargetLanguage(null);
      }, 350); // Small delay to let new layout components mount and settle

      return () => window.clearTimeout(timeout);
    }
  }, [pathname, targetPath]);

  const setLanguage = useCallback(
    async (nextLanguage: LanguagePref) => {
      if (nextLanguage === language || isLanguageChanging) return;

      setIsLanguageChanging(true);
      setTargetLanguage(nextLanguage);

      // Save to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem("i18nextLng", nextLanguage);
      }

      // Compute the new pathname by swapping the locale segment
      const segments = pathname.split("/");
      if (segments[1] === "en" || segments[1] === "ar") {
        segments[1] = nextLanguage;
      }
      const newPath = segments.join("/");
      setTargetPath(newPath);

      // Trigger redirect with custom wait overlay simulation
      await wait(150);
      const suffix =
        typeof window === "undefined"
          ? ""
          : `${window.location.search}${window.location.hash}`;
      router.replace(`${newPath}${suffix}`);
    },
    [isLanguageChanging, language, pathname, router],
  );

  const direction = language === "ar" ? "rtl" : "ltr";

  // Sync HTML lang and dir attributes on language change
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
      document.documentElement.dir = direction;
    }
  }, [language, direction]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      direction,
      isLanguageChanging,
    }),
    [language, setLanguage, direction, isLanguageChanging],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {isLanguageChanging && (
          <LanguageSwitchOverlay locale={targetLanguage ?? language} />
        )}
      </AnimatePresence>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
