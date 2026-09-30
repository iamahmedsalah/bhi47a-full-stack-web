# BHI47A Support

BHI47A Support is a pnpm workspace containing a Next.js student portal, a
NestJS API, and one shared TypeScript package. Turborepo coordinates development,
quality checks, tests, and dependency-aware builds.

## Requirements

- Node.js 24 (see `.node-version`)
- pnpm 10.28.0 through Corepack
- MongoDB and Redis for the complete API and end-to-end test workflow

## Local setup

```bash
corepack enable
pnpm install
```

Copy `apps/api/.env.example` to `apps/api/.env` and
`apps/web/.env.example` to `apps/web/.env.local`, then provide local values.
The root `.env.example` remains the combined reference used by Docker Compose.

Start both applications:

```bash
pnpm dev
```

- Web: `http://localhost:3000`
- API: `http://localhost:4000/api`

Filtered development is also supported:

```bash
pnpm --filter @student-portal/web dev
pnpm --filter @student-portal/api dev
pnpm turbo dev --filter=@student-portal/web
```

## Quality commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm clean
```

The workspace graph and caching policy are documented in
`docs/02-monorepo-architecture.md`. Deployment, required Vercel project settings,
and GitHub secrets are documented in `docs/11-deployment-devops.md`.

## Environment ownership

- `apps/api/.env.example`: server-only configuration and secrets. Put
  `WEB_BASE_URL` here and point it at the web origin used by attendance QR codes.
- `apps/web/.env.example`: browser-safe `NEXT_PUBLIC_*` build variables only.
- `.env.example`: combined, secret-free reference for root and Docker workflows.

Never commit populated `.env` files. The web and API are deployed as separate
Vercel projects; both need access to `packages/shared` from outside their Root
Directory.
