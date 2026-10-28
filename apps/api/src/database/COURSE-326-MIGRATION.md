# Course 326

Run from the repository root after deploying the application changes. This command uses the existing configured database; it never creates courses or edits registration history, grades, files or student records.

Preview (read only, includes historical inconsistencies for review):

```powershell
pnpm --filter @student-portal/api exec ts-node src/database/migrate-course-326.ts
```

Apply only after reviewing the target database and preview. Create a unique backup file in the ignored `backups` directory first (`New-Item -ItemType Directory -Force backups`). Existing backup files are never overwritten.

```powershell
pnpm --filter @student-portal/api exec ts-node src/database/migrate-course-326.ts --apply --backup ../../backups/course-326-before.json
```

Restore preview, then add `--apply` to restore the saved placement fields. Restore refuses a different database/course or placements edited since the migration.

```powershell
pnpm --filter @student-portal/api exec ts-node src/database/migrate-course-326.ts --restore ../../backups/course-326-before.json
```

Course-list caches expire within 120 seconds. Repeated application is a no-op when the placements already match. The historical report uses the student's current department because older registration documents do not store a department snapshot; review transfers and approved exceptions manually. Protect reports and backups as institutional student data.
