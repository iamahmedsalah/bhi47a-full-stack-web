# 02 - Monorepo Architecture

The repository is a pnpm 10 workspace orchestrated by Turborepo. Node.js 24 is
the single runtime policy declared in `.node-version` and the root
`package.json`.

## Structure

```text
student-portal/
|-- apps/
|   |-- api/              # NestJS API
|   `-- web/              # Next.js App Router application
|-- packages/
|   `-- shared/           # Shared Zod schemas, contracts, and constants
|-- docker/
|-- docs/
|-- .github/workflows/
|-- package.json
|-- pnpm-workspace.yaml
|-- pnpm-lock.yaml
|-- tsconfig.base.json
`-- turbo.json
```

`tooling/*` is included in the workspace glob for future reusable tooling, but
no tooling workspace is created until more than one package needs it.

## Workspace graph

```text
@student-portal/shared
        |       |
        v       v
@student-portal/web   @student-portal/api
```

The applications do not depend on each other. Both consume
`@student-portal/shared` through `workspace:*`; the shared package has no
internal workspace dependencies.

## Task graph

Turborepo builds dependency packages before their consumers. Build artifacts
(`dist/**` and `.next/**`, excluding `.next/cache/**`) are cacheable. Persistent
development servers and end-to-end tests are never cached.

Root commands are the supported entry points:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm clean
```

Individual workspaces remain directly runnable with pnpm filters, for example
`pnpm --filter @student-portal/web dev`.

## Shared-code policy

`packages/shared` remains the source of truth for reusable validation schemas,
API-safe contracts, enums, and constants. Backend-only validation and UI-only
types stay within their applications. Separate `validation`, `types`, `config`,
or `ui` packages should only be introduced when independent ownership or build
boundaries provide a measurable benefit.
