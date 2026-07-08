'use client';

import React, { createContext, useCallback, useContext, useMemo, useState, useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useParams } from "next/navigation";
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

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();

  // Retrieve current language from params, default to "ar"
  const currentLocale = (params?.locale as LanguagePref) || "ar";
  const [language, setLanguageState] = useState<LanguagePref>(currentLocale);
  const [isLanguageChanging, setIsLanguageChanging] = useState(false);

  const [targetPath, setTargetPath] = useState<string | null>(null);
  const [targetLanguage, setTargetLanguage] = useState<LanguagePref | null>(null);

  // Sync state if locale param changes externally
  useEffect(() => {
    if (params?.locale && params.locale !== language) {
      const timeout = window.setTimeout(() => {
        setLanguageState(params.locale as LanguagePref);
      }, 0);

      return () => window.clearTimeout(timeout);
    }
  }, [params?.locale, language]);

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
      await wait(1200); // Allow showing the rotating BHI logo animation for a brief moment
      router.push(newPath);
    },
    [isLanguageChanging, language, pathname, router]
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
    [language, setLanguage, direction, isLanguageChanging]
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
