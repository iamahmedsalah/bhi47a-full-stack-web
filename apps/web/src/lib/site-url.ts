/**
 * Canonical Site URL resolution helper.
 * Ensures consistent canonical URLs, OpenGraph image tags, sitemaps, and robots.txt.
 * Priority: NEXT_PUBLIC_APP_URL -> VERCEL_PROJECT_PRODUCTION_URL -> VERCEL_URL -> fallback live domain.
 */
export function getSiteUrl(): string {
  const customUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (customUrl) {
    return customUrl.replace(/\/+$/, '');
  }

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProd) {
    return `https://${vercelProd.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  }

  const vercelDeployment = process.env.VERCEL_URL?.trim();
  if (vercelDeployment) {
    return `https://${vercelDeployment.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  }

  return 'https://bhi47a-support.vercel.app';
}
