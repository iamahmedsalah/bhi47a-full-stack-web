/** Redirect only explicitly configured legacy hosts to a fixed HTTPS origin. */
export function canonicalRedirect(
  requestUrl: string,
  canonicalOrigin?: string,
  legacyHosts = "",
): string | undefined {
  if (!canonicalOrigin?.trim()) return;
  let origin: URL;
  try {
    origin = new URL(canonicalOrigin);
  } catch {
    return;
  }
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    return;
  const current = new URL(requestUrl);
  if (current.host === origin.host) return;
  const allowed = legacyHosts
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.includes(current.host.toLowerCase())) return;
  const target = new URL(origin.origin);
  target.pathname = current.pathname;
  target.search = current.search;
  // A server does not receive URL fragments. Keep Location without a fragment so
  // the browser retains an existing admission QR fragment across the redirect.
  return target.toString();
}
