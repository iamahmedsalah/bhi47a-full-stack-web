import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const appRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(appRoot, "../..");
const workspaceEnvPath = resolve(workspaceRoot, ".env");

function loadWorkspacePublicEnv() {
  if (!existsSync(workspaceEnvPath)) return;

  const envFile = readFileSync(workspaceEnvPath, "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key.startsWith("NEXT_PUBLIC_") || process.env[key]) continue;

    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

loadWorkspacePublicEnv();

const appEnv = (process.env.NODE_ENV || "development").toUpperCase();
const appVersion = process.env.npm_package_version || "1.0.0";

console.log(`\n────────────────────────────────────────────────────────`);
console.log(`  STUDENT PORTAL FRONTEND (WEB)`);
console.log(`  • Environment : [ ${appEnv} ]`);
console.log(`  • Version     : v${appVersion}`);
console.log(`────────────────────────────────────────────────────────\n`);

// output: "standalone" is for Docker deployments only (Dockerfile.web sets BUILD_STANDALONE=true).
// Do NOT set output: "standalone" for Vercel — Vercel's Next.js adapter owns the output format
// and a standalone build breaks Vercel's routing, causing a platform-level 404 NOT_FOUND.
const isStandaloneOutput = process.env.BUILD_STANDALONE === "true";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_APP_ENV: process.env.NODE_ENV || "development",
  },
  // React compiler runs babel-loader subprocesses that crash and timeout on large components in Turbopack/Docker
  reactCompiler: false,
  experimental: {
    optimizePackageImports: [
      "framer-motion",
      "@xyflow/react",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
      "@radix-ui/react-popover",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
    ],
  },
  ...(isStandaloneOutput && {
    output: "standalone",
    outputFileTracingRoot: workspaceRoot,
  }),
  transpilePackages: ["@student-portal/shared"],
  turbopack: {
    root: workspaceRoot,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 31536000,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
  // Same-origin API proxy (recommended for Vercel when web and API are on separate hosts).
  // Set API_PROXY_TARGET=https://<api-host> (no trailing /api) on the web project and
  // NEXT_PUBLIC_API_URL=/api. Cookies then become first-party, so mobile browsers and
  // in-app browsers that block third-party cookies keep the session.
  async rewrites() {
    const target = process.env.API_PROXY_TARGET?.trim().replace(/\/+$/, "").replace(/\/api$/, "");
    if (!target) return [];
    return [{ source: "/api/:path*", destination: `${target}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
      {
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/favicon_io/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/fonts/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/(logo.webp|logo.png|favicon.ico|icon.png|apple-icon.png)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
