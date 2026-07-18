export function isChromeBrowser(): boolean {
  if (typeof window === 'undefined') return false;

  const { userAgent, vendor } = window.navigator;
  const navigatorWithBrave = window.navigator as Navigator & { brave?: unknown };
  const isGoogleChrome =
    /Chrome|Chromium/.test(userAgent) && /Google Inc/.test(vendor);
  const isChromiumVariant =
    /Edge|Edg|OPR|Opera|Vivaldi|YaBrowser|CocCoc/.test(userAgent) ||
    typeof navigatorWithBrave.brave !== 'undefined';

  return isGoogleChrome && !isChromiumVariant;
}
