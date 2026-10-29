# Targeted performance findings — 29 October 2026

This report follows `STUDENT_PORTAL_TARGETED_PERFORMANCE_FIX.md`. The four original CSVs in Downloads were parsed independently; filenames, SHA-256 hashes and sanitized aggregates are in [BASELINE_EVIDENCE.json](BASELINE_EVIDENCE.json). Historical reports in this directory describe earlier work and different samples.

## Enrollment: confirmed repeated validator reads

`CoursesController.enrollStudentsBatch` calls `CoursesService.enrollStudentsBatch` → `processEnrollmentRows` → `RegistrationsService.assertAdministrativeCourseAddition`. Student-code resolution and existing-registration reads were already batched; registrations were already written with `bulkWrite`. The remaining sequential loop invoked the single-student validator for each new enrollment.

For a student with published grades, that validator makes six Mongoose reads: academic profile, student profile, published grades, grade-course credits, matching GPA rule, and selected-course credits. Without published grades the grade-credit read is absent, leaving five reads. Mongoose query middleware adds timing; it does not itself make these reads. The schema files contain no registration save/query business hooks to reimplement when batching writes.

The export's 246/756 calls are consistent with a linear per-student workload plus fixed overhead. Batch sizes and workbook rows were not exported, so the exact historical row counts and any legacy-profile repairs cannot be proved. In particular, the observed numbers do **not** establish that the requests contained 25/100/500 students. Overlapping reads explain why summed database durations exceed HTTP wall time.

`prepareAdministrativeEnrollment` now fetches academic profiles, student context and grades per 100 unique students. It fetches credit data in groups of at most 500 codes and reuses those credits across student chunks. It loads active GPA rules once per request and uses the existing academic-progress merger. Both single-student and snapshot selection sort by descending `minGpa`, then ascending `_id`; inclusive ranges and highest-minimum precedence are preserved. Equal-minimum ties now have an explicit deterministic `_id` tie-breaker. There is no cross-request rule cache. Missing academic/student profiles retain the existing repair path; such imports can still incur per-student reads.

Initial student-code lookups are bounded to 500 candidates, registration lookups and writes to 100 students/operations. Existing-registration updates compare the validated course array atomically before adding a course, incrementing credits and appending any override audit. The existing unique `(studentId, academicYear, semester)` index protects new-registration races. A real MongoDB concurrency fixture proves that two competing additions cannot both consume a single remaining course slot.

There is no course-seat-capacity field or capacity-enforcement path in the inspected course schema/import. This work preserves the actual academic, department/term, prerequisite, co-requisite, equivalent-course, GPA, blocked-student, override-permission and audit rules; it does not invent a new capacity policy. This import was already nontransactional across profile and registration collections. Profile synchronization may persist before a later registration conflict; the error identifies the write kind and partial outcome.

## Complaints: document transfer and serialization

`ComplaintsService.findAll` already uses `.lean()`, exact filtered counts, bounded pagination and deterministic `{createdAt:-1,_id:-1}` ordering. That compound index is already declared in `schemas/complaint.schema.ts`; no production index was created or changed.

The list previously included descriptions, attachment data URLs, replies, internal notes and status histories. Four correlated slow requests show page-query stages of 518.5–786.6 ms, while serialization alone takes 195.2–208.8 ms. Count and enrichment stages are much smaller. This supports testing payload reduction; it does not prove an index is missing in the deployed database.

The optional `view=summary` excludes those five large fields. Omitted `view` and `view=full` preserve the existing full-list contract. The admin screen requests summaries and fetches full data through `GET /api/admin/complaints/:id` on demand. Both routes require the existing admin/staff role and `complaints.read` permission. Counts and filter semantics remain unchanged. Arabic/English drawer loading, failure/retry, overlapping requests, mutation updates and URL-selected tickets are handled separately from summary rows.

The isolated fixture measures BSON size, winning plans, documents/keys examined, HTTP bytes, page-query time and serialization time separately. Its existing sort index avoids a blocking `SORT`. These local plans do not establish production index deployment or selectivity.

## Other lookups and monitoring

Academic-profile `studentId`, student-profile `userId`, course `code`, and grade `(studentId,isPublished)` indexes already exist. The synthetic plans use those indexes. The current GPA range index still has a blocking sort in the two-rule fixture; enrollment removes the repeated range query instead of adding an unproved range index. Representative production/staging distributions are needed before proposing another index.

`AuthSessionStore.assertActive` performs a fresh primary-key existence query with user, token version, revoked-state and expiry conditions. A synthetic plan examines one key/document. The isolated 263 ms historical `auth.session` observation cannot distinguish checkout, network, command execution or scheduling delay. Existing driver checkout and command histograms remain separate, with no cross-request authorization cache or password-cost change.

Existing traffic PromQL uses `rate`/`increase` and window-specific histogram quantiles, retains status distributions, and separates anonymous/session/permission denials from server errors. The two-row traffic export only covers heartbeat and health and cannot establish app-wide failure rates or trends. New enrollment diagnostics add bounded structural fingerprints, operation totals and per-validator-invocation counts without row identities or query values. `bulkWrite` bypasses query/save middleware, so the course service records each invocation once; driver command metrics remain distinct from these logical Mongoose-operation counts.

## Remaining evidence

No representative staging environment or credentials were supplied. Historical p95 improvement, deployed index state, real complaint BSON sizes, the cause of the session outlier and exact 246/756 batch composition remain unverified. See [BEFORE_AFTER.md](BEFORE_AFTER.md) and [ROLLOUT_ROLLBACK.md](ROLLOUT_ROLLBACK.md).
