export const THEME_COLORS = {
  light: '#0c2731',
  dark: '#101518',
} as const;

export const THEME_COLOR_OVERRIDE_ATTR = 'data-theme-override';

export function syncThemeColorMeta(
  theme: 'light' | 'dark' | 'system',
  resolvedTheme: 'light' | 'dark',
): void {
  if (typeof document === 'undefined' || !document.head) return;

  const selector = `meta[name="theme-color"][${THEME_COLOR_OVERRIDE_ATTR}="true"]`;
  const existing = document.head.querySelector<HTMLMetaElement>(selector);

  if (theme === 'system') {
    existing?.remove();
    return;
  }

  const meta = existing ?? document.createElement('meta');
  meta.setAttribute('name', 'theme-color');
  meta.setAttribute(THEME_COLOR_OVERRIDE_ATTR, 'true');
  meta.setAttribute('content', THEME_COLORS[resolvedTheme]);

  if (!existing) {
    document.head.prepend(meta);
  }
}
