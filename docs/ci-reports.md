# CI reports and the VPS website link

Open **Actions → CI/CD - VPS → the run → Summary** to see the Jest Test Report. It lists workspace lint, typecheck, build and Control browser outcomes, followed by separate API unit, Admissions, Control integration and API end-to-end test totals. Node.js checks and other browser checks retain their own job step logs; they are not included in Jest totals.

The report runs even after a failed step. Tests that did not run are marked skipped, not passed. Missing/invalid output from a successful test step fails reporting rather than displaying a misleading green result. Failed assertions create file annotations (up to 50); full diagnostics remain in the test logs. JSON reports are downloadable as **api-test-reports** for 14 days. Unit JSON lives inside Turbo's existing `coverage/**` output so cached test runs restore their report too.

The workflow explicitly creates `apps/api/coverage` after dependency installation and before tests. Jest's `--outputFile` does not create missing parent directories: without this preparation, even a fully passing run can exit with `ENOENT` while saving its report. The regression test runs this exact preparation twice on a clean temporary filesystem, then verifies JSON output and Jest exit codes for both failed and passing runs.

The **Deploy reviewed commit to VPS** job uses the existing **production-vps** GitHub environment with `https://bhi47.app` as its environment URL. GitHub displays this as a clickable deployment link. Its summary includes the website, login, deployed commit, SSH/internal health outcome and public HTTPS health/login outcome. Public checks run only after a successful SSH deployment. A failed public check fails the job and requires investigation; it does not automatically roll back a deployed release.

No DNS record changes are needed to display the link. DNS, TLS and the VPS reverse proxy must already serve this domain. Existing production environment approvals/secrets and deployment gates are unchanged: validation plus container smoke tests must pass; only main pushes or manual VPS runs from main may deploy.

The public API health validator checks the real response envelope: `success: true` and `data.status: "ok"`. The API's transform interceptor wraps the health payload under `data`; checking a top-level `status` falsely rejects a healthy deployment. Invalid JSON, unsuccessful envelopes and unhealthy/missing statuses still fail the deployment check.

Jobs use Ubuntu 24.04 explicitly. Checkout, Node setup, caching and pnpm setup use Node 24 action runtimes; artifact upload uses its Node 24 release. The project Node version remains 24 and pnpm remains 10.28.0.

Local regression checks:

```sh
node --test scripts/vps-workflow.test.cjs scripts/ci-test-report.test.cjs
```

The first actual GitHub run is required to verify rendered summaries, artifact upload and the deployment card. Public checks against the real VPS run only when the normal deployment policy permits deployment.

References: GitHub's [job summary commands](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#adding-a-job-summary) and [deployment environment URLs](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idenvironment). Action runtime declarations were checked in the official `action.yml` files for [checkout v5](https://github.com/actions/checkout/blob/v5/action.yml), [setup-node v5](https://github.com/actions/setup-node/blob/v5/action.yml), [cache v5](https://github.com/actions/cache/blob/v5/action.yml), [pnpm setup v5](https://github.com/pnpm/action-setup/blob/v5/action.yml) and [artifact upload v6](https://github.com/actions/upload-artifact/blob/v6/action.yml).
