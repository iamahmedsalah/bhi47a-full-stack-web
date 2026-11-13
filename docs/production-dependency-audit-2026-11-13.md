# Production dependency audit — 13 November 2026

Commands: `pnpm audit --prod --json` and `pnpm audit --json` against the updated lockfile. The production scan succeeds; the full scan retains the development-only advisory described below.

## Current result after remediation

`pnpm audit --prod --json` now succeeds with **zero advisories at every severity**. The full `pnpm audit --json` reports **one low development-only advisory**, `GHSA-gcqx-w48m-w2h4`, in Jest's `deepmerge@4.3.1`. No high, moderate or critical advisories remain in either scan.

There is no published patched deepmerge release. Its Node entry and source are locally hardened using `patches/deepmerge@4.3.1.patch`, registered through pnpm's `patchedDependencies` and reproduced in the lockfile. The patch defines own enumerable data properties instead of invoking prototype setters during object merging. Security regressions resolve the exact copy used by Jest, exercise both target/source poisoning, and verify arrays, globals, dates, symbols and custom array merges. The unpatched distribution reproduces the reported inheritance problem; the patched implementation blocks it. This is a **local mitigation**, not an upstream advisory resolution: the original version and registry warning remain visible, and the full audit still exits nonzero. No audit-ignore exception was added.

Direct installed versions after remediation:

| Package | Installed version |
| --- | --- |
| Mongoose | 8.24.9 |
| Firebase Admin | 14.5.1 |
| Axios | 1.21.1 |
| Zod (web and shared) | 4.6.7 |
| Nest CLI | 12.0.12 |
| rimraf | 6.1.4 |

Compatible security overrides select body-parser 2.4.0, Multer 2.5.0, fast-uri 3.1.9, RE2JS 2.8.7, qs 6.16.1, follow-redirects 1.16.2 and fast-xml-parser 5.12.0. The Firebase Firestore chain was upgraded within its owning major version. Modern glob/minimatch consumers use 14.0.3/11.0.5; legacy glob 7 and minimatch 3/5 retain their separate APIs. Actual Jest coverage collection is exercised in the CI report regression.

The Nest CLI's unused optional webpack typechecker is excluded because it introduces another unpatched deepmerge path. `apps/api/nest-cli.json` uses the TypeScript compiler; normal build/start/watch remain supported. Switching to the optional webpack compiler later requires revisiting that exclusion and its security dependency chain.

The shared schemas moved from Zod 3 to Zod 4. Additional tests preserve institutional-code, login-password, permanent-password and field-error contracts. Dependency updates do not migrate application data. No production deployment or live database operation was performed.

## Initial production baseline

The initial scan found **18 advisories: 8 high, 7 moderate, 3 low; no critical advisories**. The table below records that historical baseline, not current unresolved production findings. No earlier comparable audit baseline was supplied to establish when each advisory first appeared.

| Package | Severity | Vulnerable versions | Patched versions | Advisory |
| --- | --- | --- | --- | --- |
| zod | high | `<4.6.6` | `>=4.6.6` | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) |
| body-parser | high | `>=2.0.0 <2.4.0` | `>=2.4.0` | [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828) |
| multer | high | `>=2.0.0 <2.5.0` | `>=2.5.0` | [GHSA-q7qp-rjg7-q26m](https://github.com/advisories/GHSA-q7qp-rjg7-q26m) |
| fast-uri | moderate | `>=3.0.0 <3.1.9` | `>=3.1.9` | [GHSA-w74x-v6f9-j3xg](https://github.com/advisories/GHSA-w74x-v6f9-j3xg) |
| fast-uri | low | `>=3.0.0 <3.1.9` | `>=3.1.9` | [GHSA-xhq7-xmqj-769h](https://github.com/advisories/GHSA-xhq7-xmqj-769h) |
| fast-uri | moderate | `>=3.1.3 <3.1.9` | `>=3.1.9` | [GHSA-wjr9-j795-jxcr](https://github.com/advisories/GHSA-wjr9-j795-jxcr) |
| fast-uri | low | `>=3.0.0 <3.1.9` | `>=3.1.9` | [GHSA-333x-w4r6-6crp](https://github.com/advisories/GHSA-333x-w4r6-6crp) |
| re2js | high | `>=2.2.0 <2.8.7` | `>=2.8.7` | [GHSA-gg6h-894w-4m9c](https://github.com/advisories/GHSA-gg6h-894w-4m9c) |
| qs | moderate | `>=6.7.0 <=6.16.0` | `>=6.16.1` | [GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw) |
| follow-redirects | high | `>=1.16.0 <=1.16.1` | `>=1.16.2` | [GHSA-mrwp-f3q8-3g9p](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p) |
| glob | moderate | `>=9.0.0 <=14.0.1` | `>=14.0.2` | [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) |
| minimatch | moderate | `>=7.0.0 <11.0.1` | `>=11.0.1` | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) |
| mongoose | high | `>=8.0.0 <8.24.7` | `>=8.24.7` | [GHSA-gg4r-jv3p-qx3c](https://github.com/advisories/GHSA-gg4r-jv3p-qx3c) |
| mongoose | moderate | `>=8.0.0 <8.24.7` | `>=8.24.7` | [GHSA-wr5m-5jph-8m96](https://github.com/advisories/GHSA-wr5m-5jph-8m96) |
| mongoose | high | `>=8.0.0 <8.24.7` | `>=8.24.7` | [GHSA-8332-j7wj-wjw4](https://github.com/advisories/GHSA-8332-j7wj-wjw4) |
| mongoose | moderate | `>=8.0.0 <8.24.7` | `>=8.24.7` | [GHSA-6972-9mcm-vhwj](https://github.com/advisories/GHSA-6972-9mcm-vhwj) |
| fast-xml-parser | low | `<=5.11.2` | `>=5.12.0` | [GHSA-474x-hrwr-fgx4](https://github.com/advisories/GHSA-474x-hrwr-fgx4) |

## Affected production dependency chains

- `apps/web>zod`
- `packages/shared>zod`
- `apps/api>@nestjs/platform-express>express>body-parser`
- `apps/api>@nestjs/platform-express>multer`
- `apps/web>@hookform/resolvers>ajv>fast-uri`
- `apps/web>firebase>@firebase/firestore>re2js`
- `apps/api>@nestjs/platform-express>express>qs`
- `apps/web>axios>follow-redirects`
- `apps/api>firebase-admin>@google-cloud/firestore>@google-cloud/firestore-api>google-gax>rimraf>glob`
- `apps/api>firebase-admin>@google-cloud/firestore>@google-cloud/firestore-api>google-gax>rimraf>glob>minimatch`
- `apps/api>mongoose`
- `apps/api>firebase-admin>@google-cloud/storage>fast-xml-parser`

## Verification and maintenance

Completed against the updated packages:

- Frozen lockfile installation and workspace TypeScript checking.
- Workspace lint, with no reported warnings or errors.
- All three production builds and the web root-route/API runtime artifact checks.
- All 96 API unit suites / 910 tests, and 18 isolated API startup/authentication E2E tests against localhost MongoDB. The temporary database service was stopped afterward.
- 82 web unit tests and seven deployment-policy tests.
- Three dependency prototype-safety tests and eight CI-report tests, including real Jest coverage collection.
- Arabic/English admissions period/student-code and public admission workflow browser checks. The standalone periods fixture also fixes the reported `INTAKE26` timeout caused by importing Next's image runtime; see [ci-reports.md](ci-reports.md).

The first combined web/report regression run passed 99 of 100 checks; its real-Jest subprocess exceeded its unchanged 60-second timeout while other verification jobs were loading. Separate reruns passed all 89 web/deployment checks and all 11 security/report checks, retaining the original assertions and timeouts. After the workflow diagnostic artifact was added, all 15 CI report/deployment checks passed again.

The production build still emits the existing custom static `Cache-Control` configuration warning; Jest also warns about a seed JSON import without an import attribute. Neither is an audit finding or a lint warning. The complete API E2E suite was not repeated as part of this package remediation; only the 18-test isolated startup/authentication suite is verified here.

Re-run frozen installation, production/full audits, lint, types, unit tests, production builds and relevant isolated integration/browser checks after further updates. Remove the local deepmerge patch only when an upstream fixed version is available and its replacement passes the prototype-safety regressions.

The remaining low registry advisory should continue to be tracked. Do not describe the full audit as clean while it still reports the original deepmerge version, even though the exercised Jest code path has the local fix.

Raw local reports: `outputs/package-audit-before.json`, `outputs/package-audit-production-final.json` and `outputs/package-audit-all-final.json`. The initial full scan also detected development-tool paths, which were handled in this remediation.

Advisory metadata can change; repeat both audit commands before a production release. The known Windows full-E2E process issue is tracked separately in [ci-reports.md](ci-reports.md).
