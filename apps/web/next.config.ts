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
  reactCompiler: true,
  ...(isStandaloneOutput && {
    output: "standalone",
    outputFileTracingRoot: workspaceRoot,
  }),
  transpilePackages: ["@student-portal/shared"],
  turbopack: {
    root: workspaceRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
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
    ];
  },
};

export default withNextIntl(nextConfig);
