# Production deployment

Use `main` for both deployment targets:

- Existing Vercel projects: follow [Vercel configuration](11-deployment-devops.md).
- Contabo Ubuntu VPS: follow the [VPS deployment guide](vps-deployment-guide.md).

Each target has its own environment settings. The VPS uses the existing MongoDB
Atlas URI with the exact same database name. Existing admin accounts, passwords,
students, courses, and grades remain in Atlas. No seed, reset, database restore,
or migration command belongs in the deployment process. Production seed commands
are blocked and seed/reset utilities are excluded from the VPS runtime image.

Before switching traffic, verify a backup, compare representative records, and
test existing account logins. Leave VPS background workers disabled until the
previous host's workers are stopped. Rollback switches application images and
does not restore or reset the database.

Without a purchased domain, use the temporary DNS hostname and HTTPS procedure
in the VPS guide. Keep the current verified email sender; a temporary web hostname
does not provide email-domain ownership. Review Google OAuth hostname eligibility
before enabling Google sign-in on a temporary hostname.
