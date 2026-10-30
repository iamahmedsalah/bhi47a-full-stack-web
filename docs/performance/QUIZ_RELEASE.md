# Automatic quiz marks and review

Doctors configure marks and answer review independently in the quiz form:

- **Manual control** uses the existing publish/enable switches and three-dot actions.
- **Release automatically after closing** uses the stored overall quiz closing time.

New quizzes default to manual control, with marks hidden and review disabled.
Existing quizzes retain their manual flags; missing release modes mean `manual`.
Automatic modes require a valid closing date, even for a draft quiz.

## Server policy

The optional `resultsReleaseMode` and `reviewReleaseMode` fields accept `manual`
or `after_close`. The API evaluates availability using server time on each
request; `now >= endsAt` is closed. UTC instants remain the database contract,
and release previews display `Africa/Cairo` time.

Quiz opening/closing inputs explicitly represent Cairo wall time, even when
the doctor uses a browser in another country. A cached IANA `Intl` formatter
converts these inputs into UTC instants before saving, including Egypt's summer
and winter offsets. Newly entered nonexistent or repeated daylight-saving
minutes are rejected with a bilingual validation message; choose another time.
An unchanged saved timestamp retains its exact seconds and instant, including
legacy deadlines during a repeated hour. Quiz schedule displays also use Cairo.

The VPS may keep its operating-system timezone set to UTC or another zone:
`Date.now()` compares absolute instants, not local clock labels. The system clock
must be accurate. On a systemd VPS, check `timedatectl status` and
`timedatectl show -p NTPSynchronized --value` (expected `yes`). If synchronization
is disabled, `sudo timedatectl set-ntp true` enables the available NTP service;
confirm synchronization afterward. Changing the VPS timezone is unnecessary.
See the [ECMAScript Date definition](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.now)
and [systemd timedatectl documentation](https://www.freedesktop.org/software/systemd/man/latest/timedatectl.html).

Automatic marks become available after closing. Review additionally requires
visible marks, enabled review, a published quiz, and the student's own saved
submission. Manual marks may be published earlier; detailed correctness and
model answers remain hidden until closing when a closing date exists.

One policy filters student quiz lists, normal submissions, forced-exit
submissions and review responses. Management responses retain configured flags
and include effective `resultsAvailable`, `reviewAvailable` and `isEnded` values.
Student `publishResults` is the effective marks flag, and `canReview` includes
the student's submission requirement. Answer keys and correctness details are
never added to cached question manifests.

Manual three-dot actions set the corresponding mode to `manual`, cancelling
that automatic setting. Editing the deadline reschedules release immediately;
changing an already elapsed deadline can hide future access again but cannot
recall answers that students have already viewed.

## Refresh and scaling

The visible quiz page schedules one list refresh at its nearest release
deadline, with 0–5 seconds of jitter. Later deadlines are scheduled from the
fresh response. Hidden pages stop their timer and refresh when visible again.
Student pages also refresh on focus and reconnect. Timing uses the existing
response envelope's server timestamp plus a monotonic browser elapsed time.
No per-student publishing job, cron task, constant polling, or release-time
database write is needed. API restarts and disabled background workers do not
affect release eligibility.

Cairo conversion runs in the doctor's browser when a schedule changes, with no
new timezone conversion, database query or background work in the API's release
policy. Each release check still takes constant work per returned quiz. The
staggered deadline refresh spreads requests over five seconds; this is not a
capacity guarantee for 10,000 concurrent students. Existing application and
database load still require representative load tests on the deployed VPS.

Existing grading and attempt-finalization behavior is unchanged: only saved
submissions have results. Release notifications and custom release dates are
outside this feature.

## Verification and deployment

The policy and service tests cover closing boundaries, separate controls,
legacy flags, deadline validation, answer masking, forced exits and manual
overrides. The isolated HTTP test checks Mongo persistence, permissions,
CSRF, automatic release and a fresh service instance without a queue worker.
Chromium tests exercise the real Arabic/English admin and student pages,
including editing a closed quiz, deadline refresh and an open result modal.

Run workspace lint, typecheck, API tests, production builds and local E2E tests.
The frontend checks are `pnpm --filter @student-portal/web test:quiz-release`
and `pnpm --filter @student-portal/web test:quiz-release:browser`; both run in CI.

Deploy the API before the web app. No schema backfill, database seed, extra
worker or VPS scheduling configuration is needed.

## Question sheet updates

A fully valid upload replaces the complete question set in the editor; clicking
Save Quiz persists it. Re-uploading does not append duplicates. Rows unchanged
in text, type and option order retain their question IDs (including reordered
rows); new/rewritten questions use new IDs. Questions omitted from the file are
removed on save. Invalid files, including partial files with row errors, leave
the current editor questions intact. Saving is disabled during parsing.

The XLSX template includes an English/Arabic `Instructions` sheet and header
notes. `Quiz Questions Template` contains only the import headers and examples.
The CSV template includes an ignored `instructions` column and a UTF-8 BOM.
Both formats demonstrate MCQ answer `B` (second option), TF answer `T` (true,
first option) and TF answer `F` (false, second option). `TF` belongs in `type`;
`T`/`F` belong in `correct_answer`. Remove example rows before entering real QA.
CSV quoted commas, quotes and multiline text are supported.

### Verification recorded for this change

- API unit tests: 68 suites, 541 tests passed. An initial sandboxed run timed
  out in an HTTP security test; the complete rerun with local HTTP access passed.
- E2E: all 5 suites and 31 cases passed with isolated localhost MongoDB/Redis,
  including the benchmark that requires permission to write its CPU profile.
- All 8 frontend deadline, timezone and import tests passed. Cairo conversion
  was checked under UTC, New York, Tokyo and Cairo, including DST edge cases.
- Real-page Chromium acceptance passed for Arabic/English controls, Cairo
  previews, closed-quiz editing, saving Cairo inputs from UTC/New York browsers,
  repeated sheet uploads, invalid-file preservation, automatic refresh,
  focus/reconnect and updates to an open result dialog.
- Workspace lint passed with no errors; existing frontend warnings remain.
  The final changed helpers also passed focused lint.
- Workspace and E2E typechecks passed. Shared/API/web production builds passed,
  including final Next.js TypeScript checks and production route manifest audits.
- Updated XLSX/CSV template samples were generated in `outputs/quiz-release/`.
- No load test against a live VPS with 10,000 concurrent students was performed.
- No live deployment or production database changes were performed.
