# Production dependency audit — 13 November 2026

Command: `pnpm audit --prod --json` against the current lockfile. The registry audit returned a nonzero exit code because vulnerabilities were found.

**18 advisories: 8 high, 7 moderate, 3 low; no critical advisories.** This is a current snapshot, not proof that each advisory is newly introduced: no earlier comparable audit baseline was supplied.

No dependency versions, overrides, lockfile resolutions or application data were changed in this lint-cleanup task. These findings remain open. A clean lint/typecheck result does not resolve dependency vulnerabilities.

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

## Remediation and verification

Prioritize the high-severity paths: Mongoose, Zod, Multer/body-parser, follow-redirects and RE2JS. Same-major patched releases exist for these listed ranges, but compatibility and the final lockfile must still be verified.

For glob/minimatch, the reported fixed major versions differ from several installed transitive versions. Upgrade the owning dependency chain where possible and review its engine/API requirements; avoid forcing an untested major through a global override.

After updating dependencies, reinstall with the repository pnpm version, rerun the production audit, and verify lint, types, unit tests, production builds and relevant isolated integration/browser tests. In particular, rerun database/query security tests, compressed HTTP request handling, multipart upload cancellation and workbook imports, and authentication/redirect tests.

The full raw registry response is stored locally in ignored `outputs/production-audit.json`. Advisory metadata can change; repeat the command before a production release.
