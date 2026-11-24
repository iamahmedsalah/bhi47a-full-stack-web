export const THEME_COLORS = {
  light: '#0c2731',
  dark: '#101518',
} as const;

export function syncThemeColorMeta(
  theme: 'light' | 'dark' | 'system',
  resolvedTheme: 'light' | 'dark',
): void {
  if (typeof document === 'undefined' || !document.head) return;

  const metas = document.head.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );

  for (const meta of metas) {
    if (theme === 'system') {
      const media = meta.getAttribute('media') || '';
      if (media.includes('dark')) {
        meta.setAttribute('content', THEME_COLORS.dark);
      } else if (media.includes('light')) {
        meta.setAttribute('content', THEME_COLORS.light);
      } else {
        meta.setAttribute('content', THEME_COLORS[resolvedTheme]);
      }
    } else {
      meta.setAttribute('content', THEME_COLORS[resolvedTheme]);
    }
  }
}
