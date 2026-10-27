# Pull the latest reviewed code and deploy over SSH

Checked against `.github/workflows/ci-cd.yml` and `deploy/deploy.sh` on 25 October 2026.

Repository: https://github.com/iamahmedsalah/bhi47a-full-stack-web

Website: https://portal.169-58-108-189.sslip.io

Run commands **one at a time**. If a command fails, stop and inspect its output
before continuing. This guide does not execute a deployment or change CI settings.

## 1. Automatic deployment and why earlier runs skipped the VPS

The workflow is called **CI/CD - Vercel and VPS**. Its jobs have different purposes:

| Job | What it does | When it deploys |
| --- | --- | --- |
| Validate monorepo | Lint, types, tests, build and artifact checks on GitHub's runner | Never deploys by itself |
| Build and smoke-test VPS containers | Builds and tests isolated containers on GitHub's runner | Does not update the actual VPS |
| Deploy API to Vercel | Deploys the Vercel API project | Push to main, or manual main run with target vercel |
| Deploy web to Vercel | Deploys the Vercel web project after API deployment succeeds | Same Vercel condition, and its dependencies must succeed |
| Deploy reviewed commit to VPS | Connects to the VPS and invokes the deployment script | Push to main, or manual main run with target vps, after both validation jobs succeed |

The VPS job has this exact condition:

```yaml
if: >-
  (github.event_name == 'push' && github.ref == 'refs/heads/main') ||
  (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.deployment_target == 'vps')
```

The earlier version allowed only workflow_dispatch, so normal pushes skipped the
VPS job. The updated version also deploys main pushes automatically after both
validation jobs pass. Missing VPS secrets are not what this condition tests: if an
eligible VPS job starts without secrets, its explicit checks fail instead.

| Event/ref/target | Validation and Docker tests | Vercel deployment | VPS deployment |
| --- | --- | --- | --- |
| Push to main | Run | Eligible | Eligible |
| Push to staging, release/* or v* tag | Run | Skipped | Skipped |
| Pull request to main/staging | Run | Skipped | Skipped |
| Manual run on main, target validate | Run | Skipped | Skipped |
| Manual run on main, target vercel | Run | Eligible | Skipped |
| Manual run on main, target vps | Run | Skipped | Eligible |
| Manual run on another branch | Run | Skipped | Skipped |

"Eligible" still depends on successful prerequisites, runner availability and any
configured environment protection rules. A skipped deployment is not the same as
a failed test, and passing CI does not establish that the VPS changed.

### Reading the supplied screenshot

- Both green jobs passed their checks on GitHub's runners.
- The VPS job's crossed-circle/0-second status matches the previous manual-only
  condition. That screenshot predates the automatic main-push condition above.
- The API deployment has a yellow status. The screenshot alone does not establish
  whether it is running, queued or awaiting environment approval.
- The web deployment has `needs: [validate, deploy-api]`. It cannot proceed before
  the API deployment succeeds. If a required job fails, is cancelled or is skipped,
  the web job can also be skipped. A hollow waiting indicator is not proof that
  the web job has already finished as skipped.

To establish the exact state, open the run in GitHub Actions and check:

1. Its event, branch and selected deployment target.
2. The status and logs of **Deploy API to Vercel**.
3. Any **Review deployments** notice for the `production-api` environment. Approve
   it only if that is the deployment you intend to run.
4. The final API conclusion and then the web job's condition/dependency status.

Live run logs and environment settings were not accessible during this review;
the explanation above is based on the checked-in workflow and supplied screenshot.
The local workflow now enables VPS-on-main-push deployment. GitHub environments,
secrets, approval rules and the running VPS have not been configured by this edit.

## 2. Understand push, pull, SSH and deploy

| Action | Where to run it | Meaning |
| --- | --- | --- |
| git push | Development checkout | Upload committed changes to GitHub |
| ssh | Your own computer | Connect to the Linux VPS |
| git pull | VPS checkout, after SSH login | Download GitHub changes into that checkout |
| bash deploy/deploy.sh | VPS checkout | Build and start the checked-out release |

The normal production flow is:

```text
Develop and verify → commit → push to GitHub → CI passes
→ GitHub Actions connects to VPS over SSH → fetch checked commit → deploy → health checks
```

Pushing from your development computer does not require connecting to the VPS.
The VPS's previously configured GitHub deploy key is read-only: it can fetch/pull,
but cannot push source changes. Normally keep that key read-only and push from
your development checkout using an account/key with repository write access.
GitHub authentication and authentication for SSH into the VPS are separate.

## 3. Commit and push from the development checkout

Skip this section when the required changes are already committed and pushed.

On your own computer, open a terminal in the repository. On Windows PowerShell:

```powershell
cd 'D:\BIS\bhi47a-full-stack-web'
```

On a Linux development computer, change to your actual clone directory instead:

```bash
cd /path/to/your/bhi47a-full-stack-web
```

Review the current branch and changes:

```bash
git status --short --branch
git diff
```

Verify the change with the applicable project checks. For application changes,
the repository uses these workspace commands (use `pnpm.cmd` in Windows PowerShell
if its execution policy blocks the pnpm PowerShell shim):

```bash
pnpm run lint
pnpm run typecheck
pnpm --filter @student-portal/api test --runInBand
pnpm run build
```

Full application E2E also needs isolated MongoDB/Redis test infrastructure; CI
provides it. Do not substitute production Atlas for the test database.

Stage the files you reviewed. Replace `path/to/reviewed-file` with a real file
path from `git status`; repeat for additional files, including new files:

```bash
git add -- path/to/reviewed-file
git diff --cached
git status --short
```

Commit and push your reviewed branch. These examples assume you are already on
`main` and are authorized to push to it; use the normal PR process if it is protected:

```bash
git commit -m "Describe the reviewed changes"
git push origin main
git log -1 --oneline
```

Check GitHub Actions for that exact commit and wait for validation and the Docker
smoke tests to pass before manual VPS deployment. Keep `.env.prod`, credentials
and private keys outside the commit. If Git says "nothing to commit", do not
create an empty commit just to deploy; check which existing commit you intend to use.

## 4. Manual fallback: connect to the Linux VPS

Once automatic deployment is configured, sections 4–9 are for manual deployment,
verification and troubleshooting. Do not start a manual update while CI is deploying.

From your own computer's terminal (Windows PowerShell or Linux):

```bash
ssh bhi47a@169.58.108.189
```

If your private key is passphrase-protected, SSH may ask for that key's passphrase.
After connecting, the prompt should resemble `bhi47a@vmi3689585:~$`.

Everything in the following sections is run **inside that Linux SSH session**.
Use `bhi47a`; direct root SSH login was disabled in the earlier setup.

## 5. Check the VPS checkout before updating

```bash
cd ~/app
git status --short --branch
git log -1 --oneline
```

Normal output includes a branch line such as `## main...origin/main` and no changed
or untracked application files. Stop if you see unexpected changes and account for
them first. Do not discard them with reset/clean commands. `.env.prod` should remain
private and ignored. The deploy script also refuses a dirty application checkout.

An automated VPS deployment uses a detached checkout, so `HEAD (no branch)` can be
expected after using that job. The next section explicitly returns to main.

## 6. Pull the latest reviewed main commit

Run individually:

```bash
git fetch origin main
git switch main
git pull --ff-only origin main
git log -1 --oneline
git rev-parse HEAD
```

`git fetch` updates remote information; `git switch main` selects the local main
branch; the fast-forward-only pull updates it without creating an unexpected merge.
If the branch has diverged or Git reports conflicts, stop and inspect rather than
forcing the update.

Compare the resulting full SHA with the commit whose CI checks passed. If a newer
commit reached main meanwhile, verify its checks before deploying it. "Already up
to date" means this checkout already has the fetched main code; it does not prove
that the containers are already running that code.

This process selects the latest reviewed **main commit**, not automatically the
newest GitHub Release/tag. To deploy a tagged release, first identify and review its
exact tag/SHA and CI result, then check out that specific version instead of pulling
main. Do not guess a production version from tag sorting alone.

## 7. Build and deploy the checked-out code

```bash
bash deploy/deploy.sh
```

The script:

1. Checks `.env.prod`, the working tree and deployment locks.
2. Uses the checked-out Git commit SHA as the Docker release tag.
3. Builds API and web images sequentially unless images for that SHA already exist.
4. Starts/recreates the Compose services and waits for container health checks.
5. Records `.deploy/current-release` and retains previous application images.
6. Attempts to restore previous images if starting the new release fails.

Expect output ending with `Release <SHA> is healthy. Previous images retained.`
Builds can take several minutes. Keep the SSH session open while it runs. This
single-replica deployment can briefly interrupt requests when containers restart.

You do not need separate hand-written Docker build commands. Ordinary application
updates use the existing Nginx routes and do not require an Nginx reload. The script
does not seed/reset Atlas or delete the Redis volume. Environment changes are
managed separately on the VPS; pulling source does not replace its private .env.prod.

## 8. Verify the deployed release

Confirm the recorded deployed SHA and checkout:

```bash
cat .deploy/current-release
git rev-parse HEAD
```

They should match after a successful normal Git-based deployment. Check the images
and container health too:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker inspect app-api-1 --format '{{.Config.Image}}'
docker inspect app-web-1 --format '{{.Config.Image}}'
```

Expect app-api-1, app-web-1 and app-redis-1 to be healthy. The API and web image
tags should match the recorded release. API/web ports remain loopback-only.

Check the API through public HTTPS/Nginx:

```bash
curl --fail --silent --show-error https://portal.169-58-108-189.sslip.io/api/health
```

Expected response includes `"success":true` and `"data":{"status":"ok"}`.

Check the Redis connection without printing its password:

```bash
docker exec app-redis-1 redis-cli PING
```

Expected: `PONG`. The Compose configuration supplies REDISCLI_AUTH inside that
container. A Redis PING confirms that server is reachable/authenticated; use the
portal metrics card to confirm the API cache is connected to its configured Redis.

Finally, open the website on your own computer, hard-refresh with Ctrl+Shift+R,
and check the changed features: login, complaint paging/details, metrics, and the
appropriate email flow if that was changed. A health endpoint is not a substitute
for feature verification. Deploy API and web together when their response contracts
change, as with the new student complaint pagination envelope.

## 9. If deployment fails

Do not repeatedly rebuild without checking the error. Inspect privately:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}'
docker compose --env-file .env.prod -f docker-compose.prod.yml logs --tail 80 api web
```

Logs may contain application/user information; redact it before sharing. Common
causes include a dirty checkout, missing environment values, build failure, an
unhealthy service, or another deployment holding the lock.

If the previous image release is available and rollback is needed:

```bash
bash deploy/deploy.sh --rollback
```

Then repeat the health and feature checks. Rollback changes the running images and
recorded release; it does **not** reset Git HEAD or restore database/environment
changes. Before the next normal deployment, intentionally select the reviewed
commit you want; otherwise you may redeploy the same failing code. Do not delete
volumes, reset Atlas, prune rollback images, or overwrite `.env.prod` to resolve a
routine application deployment failure.

## 10. One-time setup for automatic GitHub Actions deployment

The workflow already contains an SSH-based VPS job. To use it, configure the
`production-vps` GitHub environment with these secrets:

| Secret | Value |
| --- | --- |
| VPS_HOST | 169.58.108.189 |
| VPS_USER | bhi47a |
| VPS_SSH_KEY | Private key for a dedicated unattended deployment identity authorized for bhi47a on the VPS |
| VPS_KNOWN_HOSTS | Verified SSH known_hosts entry for this VPS |

The VPS must separately retain GitHub fetch access for its read-only repository
deploy key. This is a different key from the Actions-to-VPS identity. The current
workflow does not supply a private-key passphrase/interactive prompt, so reusing
your passphrase-protected personal SSH key is not a drop-in configuration.
Verify the server host key against a trusted source when setting known_hosts.

Once configured:

1. Open the repository → Actions → **CI/CD - Vercel and VPS**.
2. Choose **Run workflow**.
3. Select branch **main**.
4. Select deployment_target **vps**.
5. Run it and complete any intentionally configured environment approval.
6. Confirm both checks and the VPS deployment succeed, then verify public health
   and the website as above.

The job fetches GitHub main on the VPS, validates the selected workflow commit,
checks out that exact SHA in detached mode and runs deploy/deploy.sh. Its production
job is serialized. CI images are not uploaded to a registry by this workflow; the
VPS deployment script builds its own release images.

After these settings and the updated workflow are committed/pushed, a normal main
push automatically triggers the VPS job after validation and Docker checks. Manual
Run workflow → main → vps remains available. GitHub performs the SSH/update/build
steps for you. Existing Vercel jobs remain automatic on main pushes as well.

### Resolve the editor environment/secret diagnostics

`production-vps` is a valid environment name, and `secrets.VPS_HOST` and the other
references are valid GitHub expression syntax. The editor diagnostic can mean the
environment/secrets are absent from accessible repository metadata, or that its
signed-in account/cache cannot see them. It is not proof of a YAML syntax error.

1. Open GitHub repository Settings → Environments → New environment.
2. Enter **production-vps** exactly, then Configure environment. If it already
   exists, open it instead. If Environments is unavailable, check repository plan
   support and your repository admin access.
3. Under Environment secrets, add the four names in the table above. Repository
   secrets can also supply these names, but environment secrets keep them scoped
   to this deployment job. Never paste private key material into chat or a commit.
4. Allow deployment from main. If required reviewers/wait timers are configured,
   the job still pauses for those rules. Fully unattended operation requires an
   environment policy without a manual review requirement.
5. Refresh the editor's GitHub sign-in/metadata (or reload its window) after setup.
   Persistent diagnostics may reflect account access or a stale extension cache;
   inspect that rather than replacing secret references with hardcoded values.

### Create the Actions-to-VPS identity

This is different from the VPS-to-GitHub read-only deploy key. Generate a dedicated
key on your own computer, not in the repository. First check that this filename is
unused; if ssh-keygen asks to overwrite an existing file, stop and choose another.

```bash
ssh-keygen -t ed25519 -f "$HOME/.ssh/github_actions_vps" -C github-actions-vps
```

Use an empty passphrase for this dedicated unattended key; the workflow does not
supply a passphrase. Add the **public** key to bhi47a's authorized_keys. From Windows
PowerShell, after generating the key:

```powershell
Get-Content -Raw "$HOME/.ssh/github_actions_vps.pub" | ssh bhi47a@169.58.108.189 'umask 077; mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys; chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys'
```

Test that exact key without falling back to another identity:

```bash
ssh -i "$HOME/.ssh/github_actions_vps" -o IdentitiesOnly=yes -o BatchMode=yes bhi47a@169.58.108.189 whoami
```

Expected: bhi47a. Put the complete **private** key file contents into the GitHub
environment secret VPS_SSH_KEY using the GitHub settings UI. Do not use the .pub
file for this secret. Keep the private key off the VPS; it belongs to the CI client.

To obtain VPS_KNOWN_HOSTS from an already trusted VPS SSH session, run:

```bash
awk '{print "169.58.108.189 " $1 " " $2}' /etc/ssh/ssh_host_ed25519_key.pub
```

This prints the public host key in known_hosts format. Copy that full line into
VPS_KNOWN_HOSTS. Set VPS_HOST to 169.58.108.189 and VPS_USER to bhi47a. These public
host details are distinct from the user's authentication key.

First deployment check: confirm the workflow's Validate monorepo and Docker jobs
pass, then Deploy reviewed commit to VPS succeeds and its SSH health checks pass.
Confirm the release SHA and website using section 8. Setup has not been performed
on GitHub by this local edit, and no live deployment has been triggered here.

## References

Local verification for this update: actionlint 1.7.12 passed workflow syntax/context
checks (optional shellcheck/pyflakes integrations disabled); trigger policy tests
passed across ten event/ref/target cases; isolated deployment/rollback/backup
operations tests passed. Git whitespace checks passed. No application runtime code
changed, no real SSH deployment was tested, and GitHub settings were not modified.

- Repository workflow: `.github/workflows/ci-cd.yml`
- Deployment implementation: `deploy/deploy.sh`
- [GitHub: conditions and skipped jobs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions)
- [GitHub: reviewing deployments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments)
