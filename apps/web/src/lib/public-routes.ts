const SUPPORTED_LOCALES = new Set(['ar', 'en']);

const PUBLIC_ROOT_SEGMENTS = new Set([
  '',
  'about',
  'academics',
  'activities',
  'gallery',
  'news',
  'events',
  'downloads',
  'contact',
  'complaints',
  'admission',
]);

function routeSegments(pathname: string) {
  const cleanPath = pathname.split('?')[0].split('#')[0];
  const segments = cleanPath.split('/').filter(Boolean);
  if (segments[0] && SUPPORTED_LOCALES.has(segments[0])) {
    segments.shift();
  }
  return segments;
}

// These pages never require account state. Auth entry/change-password and
// attendance check-in and the hybrid complaint form retain session bootstrap.
export function isPublicMarketingRoute(pathname: string) {
  const segments = routeSegments(pathname);
  return segments[0] !== 'complaints' && PUBLIC_ROOT_SEGMENTS.has(segments[0] ?? '');
}

export function isAuthEntryRoute(pathname: string) {
  const segments = routeSegments(pathname);
  if (segments[0] === 'forgot-password' && segments.length === 1) return true;
  if (segments[0] !== 'login') return false;

  return (
    segments.length === 1 ||
    (segments.length === 2 &&
      ['student', 'admin', 'change-password'].includes(segments[1]))
  );
}

export function isPublicRoute(pathname: string) {
  const segments = routeSegments(pathname);
  if (segments.length === 0) return true;
  if (PUBLIC_ROOT_SEGMENTS.has(segments[0])) return true;
  if (
    segments.length === 2 &&
    segments[0] === 'attendance' &&
    segments[1] === 'check-in'
  ) {
    return true;
  }
  return isAuthEntryRoute(pathname);
}
