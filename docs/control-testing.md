# Test the Control workflow

The core flow is **Control workbook → independent approval → Grades release preview → activation → student visibility window**. Upload coursework, midterm and final marks from the course's Control workbook, not the general Grades uploader.

## Isolated interactive demo

Use a separate local API/web session. Do not point a running production API at this database or copy real student data into it.

1. Start the dedicated fixture: `pnpm run test:control:services`. It exposes the `control-test` MongoDB replica set on localhost port 27023. If this working session already has the portable fixture running on port 27023, reuse it and skip the Docker start. The automated tests use `control-e2e`; the interactive demo uses a separate `control-demo` database.
2. Run `pnpm run seed:control:demo`. The seed accepts only credential-free localhost `/control-demo` on the `control-test` replica set. It inserts tagged synthetic records and preserves existing demo work; it never resets a database or overwrites an account password.
3. In a new PowerShell terminal, start the API against the demo database:

```powershell
$env:MONGODB_URI='mongodb://127.0.0.1:27023/control-demo'
$env:CLIENT_URL='http://localhost:3000'
$env:PORT='4000'
$env:QUEUE_REQUIRED='false'
$env:QUEUE_WORKERS_ENABLED='false'
$env:RUN_STARTUP_TASKS='false'
pnpm run dev:api
```

4. In a second terminal, set `$env:NEXT_PUBLIC_API_URL='http://localhost:4000/api'`, then run `pnpm run dev:web`. Use an available local port if another instance is already running; update `CLIENT_URL` accordingly. Keep these environment overrides local to these terminals.

New demo accounts use password **`ControlDemo123!`**:

| Role in the test | Login |
| --- | --- |
| Submitter (admin login) | `control-submitter@example.test` |
| Independent reviewer (admin login) | `control-reviewer@example.test` |
| Students (student login) | `990001`, `990002`, `990003` |

Use separate browser profiles or private windows for submitter, reviewer and student. These are synthetic local credentials, never production credentials.

## Office acceptance checklist

### Guidance, Excel batches and audit previews (12 November 2026)

- The scheme dialog and workbook contain bilingual notes with distinct colors and icons for the calculation example, input increments, frozen rules and student visibility. Scheme confirmation saves settings; it does not publish results or rescale recorded marks. The scheme request sends only `key`, `max`, `step` and `enabled` for each component.
- Download the scoped XLSX template. A file may contain up to **10,000 rows**, **20 columns** and **2 MB**. The server previews it in batches of **500 rows**. The preview displays student identity, before/after values, status, row errors, saved counts and progress. Review every batch before confirming.
- Each batch is an independent transaction; the complete file is not one transaction. Invalid rows are excluded. Completed batches stay saved if a later batch fails. Retry in the same open dialog reuses the current receipt and skips completed batches, including a lost response after a successful save. Later batches are re-previewed and compared with the approved values before saving. Changed marks, permissions, workflow or rules can stop the import; re-open a fresh scoped template when instructed. Preview receipts remain scoped to the initiating user and sheet and expire through the existing TTL.
- Duplicate student codes anywhere in the file, formulas, mismatched headers/scope, unsupported files and invalid batch numbers are rejected. Row errors retain their original Excel row numbers across batches. The direct paste/row endpoint retains its 500-row limit. Neither preview nor guidance changes marks.
- In audit history, use Previous/Next to navigate beyond the first 50 events. Open an event preview to inspect the actor, timestamp in Cairo, localized source, reason and before/after values. Loading failures display a retry action rather than an empty history.
- Arabic academic labels now use **المستوى الأول، المستوى الثاني، المستوى الثالث، المستوى الرابع** throughout display text and reports. Existing spreadsheet aliases using **الفرقة** remain accepted for compatibility.

Regression commands:

```powershell
pnpm.cmd run test:control:validation
pnpm.cmd run test:control:import:browser
pnpm.cmd run test:control:e2e
```

Completion review: the scheme dialog now discards cancelled edits, offers a retry after loading failures and prevents closing during an active save. Coursework file previews show attendance and quiz contributions as separate columns. A processed batch with rejected changes displays a warning rather than a success checkmark, and the finished-file notice distinguishes saved rows from rows requiring correction. The validation-message test also complies with Next.js's reserved `module` variable rule.

Verification evidence for this increment:

| Check | Recorded outcome |
| --- | --- |
| Control workbook unit tests | 22 passed; `outputs/control-import-unit-focused.log` |
| Real replica-set workflow | 14 passed, including the 501-row two-batch XLSX commit, receipt replay, stale preview rejection, audit counts and the 3,001-student roster; `outputs/control-import-integration.log` |
| Bilingual scheme/import/audit browser checks | Passed, including strict save payloads, mobile actions, 501-row batching and a lost response without duplicate saves; rerun passed in `outputs/control-completion-browser.log` |
| Workbook browser regression | Passed with 3,001 synthetic students; `outputs/control-import-workbook-browser.log` |
| Localized validation messages | 2 passed after correcting the reserved test variable; `outputs/control-completion-error-tests-final.log` |
| Earlier full production build | All three tasks passed; `outputs/control-import-build.log`. Later completion edits require their own final checks. |
| Earlier workspace/E2E type checks | Passed; `outputs/control-import-types.log` and `outputs/control-import-e2e-types-final.log` |
| Earlier changed-source lint | No errors; `outputs/control-import-lint-changed.log`. The later full lint additionally found a reserved variable in the test harness, now fixed. |
| Broad API tests | Earlier run: 94 suites passed; security requests hit a local timeout/reset. File-storage tests passed independently (16 tests). This is not an all-green full-suite claim. |
| General E2E | The completion retry again exceeded the 120-second performance-fixture setup hook. No assertions or timeouts were weakened; `outputs/control-completion-general-e2e.log`. |

The full completion runs use `outputs/control-completion-*.log`. Workspace typechecking passed all four tasks in `outputs/control-completion-types.log`. Local resource pressure caused prolonged/stalled lint and security runs, and competing general-test/build runs were explicitly stopped. An experimental security-test listener change did not establish a pass and was removed; existing security assertions, setup and timeouts remain unchanged. The remaining gate is a clean complete CI run in a functioning test environment. No production data or deployment was changed.

Verification evidence for this increment:

| Check | Recorded outcome |
| --- | --- |
| Control workbook unit tests | 22 passed; `outputs/control-import-unit-focused.log` |
| Real replica-set workflow | 14 passed, including the 501-row two-batch XLSX commit, receipt replay, stale preview rejection, audit counts and the 3,001-student roster; `outputs/control-import-integration.log` |
| Bilingual scheme/import/audit browser checks | Passed, including strict save payloads, mobile actions, 501-row batching and a lost response without duplicate saves; rerun passed in `outputs/control-completion-browser.log` |
| Workbook browser regression | Passed with 3,001 synthetic students; `outputs/control-import-workbook-browser.log` |
| Localized validation messages | 2 passed after correcting the reserved test variable; `outputs/control-completion-error-tests-final.log` |
| Earlier full production build | All three tasks passed; `outputs/control-import-build.log`. Later completion edits require their own final checks. |
| Earlier workspace/E2E type checks | Passed; `outputs/control-import-types.log` and `outputs/control-import-e2e-types-final.log` |
| Earlier changed-source lint | No errors; `outputs/control-import-lint-changed.log`. The later full lint additionally found a reserved variable in the test harness, now fixed. |
| Broad API tests | Earlier run: 94 suites passed; security requests hit a local timeout/reset. File-storage tests passed independently (16 tests). This is not an all-green full-suite claim. |
| General E2E | The completion retry again exceeded the 120-second performance-fixture setup hook. No assertions or timeouts were weakened; `outputs/control-completion-general-e2e.log`. |

The remaining full lint, type, unit and build completion runs use `outputs/control-completion-*.log`; verify their terminal summaries and exit status before treating them as passing. Local resource pressure caused prolonged/stalled runs, and some competing runs were explicitly stopped. The security fixture now starts one IPv4 listener for the suite instead of having Supertest open and close a listener per request; its assertions and timeouts are unchanged. A clean complete CI run is still required before deployment. No production data or deployment was changed.

Browser evidence is written to `outputs/control-import-browser/`. The browser checks include strict scheme payloads, both languages, field validation, audit details, 501-row batching and a lost response after the first batch saved. API tests reopen a real generated XLSX and verify cross-batch duplicates and original row numbers. The real replica-set test checks two transactional commits and receipt replay. An untouched default scheme retains version 0 when first frozen, so the first batch does not invalidate later file batches merely by persisting unchanged defaults.

Select **2026-2027 → first semester → CTRL-DEMO** in Control. The component selector supports coursework, midterm and final. If a real course is missing, check Courses, its active flag, staff assignments and term permissions. A missing historical active flag is treated as active; explicitly inactive courses stay hidden.

- Configure the grading scheme before entering marks: coursework 20, midterm 20, final 60. Coursework defaults to attendance 5 + quizzes 15; the attendance allocation is configurable, with quizzes taking the remainder of 20. The split freezes after coursework entry.
- Enter attendance **4** and quizzes **13** for coursework **17/20**, midterm **15/20**, and final **48/60**. Complete all three synthetic students so each sheet can be reviewed. Alternatively download each sheet's scoped Excel template, fill its active-component inputs, upload, preview and commit valid rows.
- Try a mark above the maximum, an invalid step, duplicate rows and a stale template. Confirm feedback and unchanged marks for rejected rows. A stale grading scheme must be refreshed explicitly while preserving the draft.
- Submit each component as the submitter. Self-approval must fail. Approve as the reviewer and inspect Control audit history.
- In **Grades → Control releases and official results**, choose the course/term/component. Configure result policy before the first release. Confirmed defaults: pass at 50%, no separate final minimum, latest approved attempt for GPA. Best approved attempt is configurable. The existing grade scale remains in effect; all policy versions are audited and freeze after the first release.
- Preview the final release, confirm the roster count and activate it. The official total must be **80/100**, with coursework counted once. Missing/deferred required components block activation. An absent/banned final fails regardless of total; withheld results expose no numeric official result.
- Open the Grades system and the student's level, and set its opening/closing window. The student must see the released components and official total only while access is open. Draft entry and approval alone must not reveal marks.
- Reopen the final sheet with a reason. Change 48 to 0. The student must continue seeing the old 48 and 80/100 while the correction is drafted and reviewed. After independent approval, activate a fresh preview. The replacement must show 32/100, remove the course's earned credits, recompute GPA/warnings and preserve earlier release history.
- Withdraw the final release. Its official outcome must disappear and academic effects must return to the remaining active attempts/baseline. Repeat activation, reconciliation and withdrawal; credits, warnings and notifications must not accumulate.
- Inspect **Release history and jobs**. Pending reconciliation/in-app notification jobs must drain to zero. An admin can retry them. Production API workers also poll durable jobs when `QUEUE_WORKERS_ENABLED=true`; delivery to the portal uses deterministic notification IDs. This does not claim FCM/email delivery.
- Repeat the main operations in Arabic, English and a narrow mobile viewport. Test Excel downloads, keyboard movement, retrying failed saves and restoring an unsaved draft after tab navigation.

## Automated verification

```text
pnpm run lint
pnpm run typecheck
pnpm --filter @student-portal/api run typecheck:e2e
pnpm run test -- --runInBand
pnpm run build
pnpm run test:control:e2e
pnpm run test:control:browser
pnpm run test:control:release:browser
node --test scripts/seed-control-demo.test.cjs apps/api/test/control/runner-safety.test.cjs apps/api/test/control-data-audit.test.cjs
```

CI reuses the admissions replica set for Control, with a separate `control-e2e` database. The dedicated Control Compose file remains a local convenience. Browser fixtures render the real React controls/CSS with synthetic HTTP transport using the production response-envelope shape; Mongo integration verifies actual transactions and academic effects separately.

## Historical data and rollout

### Excel preview input and progress

The `Marks` sheet accepts the `score` column or the active component column (for example `midterm`). Inactive component columns remain reference values. If one column retains the saved mark and the other is edited, the edited value is validated. Two conflicting edits produce an error instead of choosing a value silently. Maximum, entry increment, registration, status, scope and revision checks still apply, including zero marks.

Preview counts distinguish valid inputs, errors and blank rows skipped. A file containing only blank marks shows an explicit no-input message and cannot be submitted. Preview progress and save progress are separate: the save bar counts rows actually saved and stays at zero before applying valid rows. Preview never publishes or saves grades. Course codes and names on the Control list open the same grade sheet as the existing actions menu, with the same capability checks.

See [control-production-acceptance.md](control-production-acceptance.md) for dated live checks, read-only inventory, the successful synthetic recovery rehearsal, repeatable commands and the remaining production gates. The live policy/history endpoints currently return 404; confirm deployment before trying the new release workflow there.

Run the read-only inventory described in [control-system-plan.md](control-system-plan.md) against an approved staging copy before migrating institute records. Historical `final` records may represent an exam component or a whole-course total; do not infer that meaning from a column name. Review their maximum, term, student identity and roster explicitly. Grade entry and review cannot silently rescale a historical total into a final-exam mark.

Existing historical completed-course lists/GPA are retained as a baseline. Where the full historical grade evidence is unavailable, the system preserves the baseline GPA rather than inventing a recalculated historical GPA. Reconcile that evidence before rollout. Result activation and academic reconciliation are separate durable stages; the jobs view makes unfinished reconciliation visible.

Back up MongoDB and rehearse restoration on a separate isolated database before production deployment. Deploy snapshots, pointer state, grading/result policies, academic baselines, audit and outbox records together. Rolling back only the web/API binary does not migrate released grades back into legacy mutable publication. Production-data classification, backup/restore rehearsal and sign-off by Control staff remain rollout gates, not claims established by the synthetic demo.

Anonymous marking, practical/oral components, multiple sittings within one term and appeals remain the optional Phase G extensions; they are outside the agreed core release.
