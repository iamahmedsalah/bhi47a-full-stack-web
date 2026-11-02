/**
 * Canonical Site URL resolution helper.
 * Ensures consistent canonical URLs, OpenGraph image tags, sitemaps, and robots.txt.
 * Deployment preview hostnames must not replace the institute's public origin.
 */
export function getSiteUrl(): string {
  const customUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (customUrl) {
    return customUrl.replace(/\/+$/, '');
  }

  return 'https://bhi47.app';
}
