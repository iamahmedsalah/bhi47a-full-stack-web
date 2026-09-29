const SUPPORTED_LOCALES = new Set(['ar', 'en']);

function routeSegments(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] && SUPPORTED_LOCALES.has(segments[0])) {
    segments.shift();
  }
  return segments;
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
  if (segments.length === 1 && segments[0] === 'complaints') return true;
  if (
    segments.length === 2 &&
    segments[0] === 'attendance' &&
    segments[1] === 'check-in'
  ) {
    return true;
  }
  return isAuthEntryRoute(pathname);
}
