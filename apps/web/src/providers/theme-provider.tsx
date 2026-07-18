'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string') {
      if (args[0].includes('Encountered a script tag')) return;
      if (args[0].includes('The given origin is not allowed for the given client ID')) return;
      if (args[0].includes('FedCM get() rejects with')) return;
      if (args[0].includes('Cross-Origin-Opener-Policy')) return;
      if (args[0].includes('Your client application uses one of the Google One Tap prompt UI status methods')) return;
    }
    orig.apply(console, args as Parameters<typeof console.error>);
  };
}


export type ThemePref = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

type ThemeProviderProps = {
  children: React.ReactNode;
};

type ThemeContextValue = {
  theme: ThemePref;
  setTheme: (theme: ThemePref) => void;
  resolvedTheme: ResolvedTheme;
  mounted: boolean;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const THEME_KEY = 'theme';

const getServerTheme = (): ThemePref => 'system';
const getServerSystemTheme = (): ResolvedTheme => 'light';
const getMountedSnapshot = (): boolean => true;
const getServerMountedSnapshot = (): boolean => false;

function normalizeTheme(theme: string | null): ThemePref {
  return theme === 'light' || theme === 'dark' || theme === 'system'
    ? theme
    : 'system';
}

function getStoredTheme(): ThemePref {
  if (typeof window === 'undefined') return 'system';

  return normalizeTheme(window.localStorage.getItem(THEME_KEY));
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function subscribeTheme(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  window.addEventListener('storage', callback);
  window.addEventListener('theme-change', callback);

  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('theme-change', callback);
  };
}

function subscribeSystemTheme(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  mediaQuery.addEventListener('change', callback);

  return () => {
    mediaQuery.removeEventListener('change', callback);
  };
}

function resolveTheme(theme: ThemePref, systemTheme: ResolvedTheme): ResolvedTheme {
  return theme === 'system' ? systemTheme : theme;
}

function applyTheme(resolvedTheme: ResolvedTheme) {
  if (typeof document === 'undefined') return;

  document.documentElement.setAttribute('data-theme', resolvedTheme);
  document.documentElement.style.colorScheme = resolvedTheme;

  // لأنك بتستخدم data-theme فقط
  document.documentElement.classList.remove('dark');
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const theme = useSyncExternalStore<ThemePref>(
    subscribeTheme,
    getStoredTheme,
    getServerTheme
  );

  const systemTheme = useSyncExternalStore<ResolvedTheme>(
    subscribeSystemTheme,
    getSystemTheme,
    getServerSystemTheme
  );

  const mounted = useSyncExternalStore<boolean>(
    () => () => {},
    getMountedSnapshot,
    getServerMountedSnapshot
  );

  const resolvedTheme = useMemo(() => {
    return resolveTheme(theme, systemTheme);
  }, [theme, systemTheme]);

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((nextTheme: ThemePref) => {
    window.localStorage.setItem(THEME_KEY, nextTheme);
    document.cookie = `theme=${nextTheme}; path=/; max-age=31536000; SameSite=Lax`;
    window.dispatchEvent(new Event('theme-change'));

    // Try to update theme preference on server DB in the background
    import('@/lib/api')
      .then(({ default: api }) => {
        api.patch('/auth/theme', { theme: nextTheme }).catch(() => {});
      })
      .catch(() => {});
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      resolvedTheme,
      mounted,
    }),
    [theme, setTheme, resolvedTheme, mounted]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);

  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  return ctx;
}

export default ThemeContext;