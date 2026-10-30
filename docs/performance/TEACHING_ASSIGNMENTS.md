# Teaching assignments and quiz defaults

## Staff management dialog

The **Assigned Courses** tab in staff management calls `GET /api/admin/courses?staffId=<selected-account>&page=1&limit=100`. Its old request included `_t=...`, which is absent from `QueryCourseDto`. Production validation rejects that parameter with HTTP 400. The former catch handler returned an empty array, so this error appeared as "No courses are currently assigned" for every staff account.

The corrected request uses supported parameters, follows all pages and propagates failures to an Arabic/English error with a retry action. Reopening the dialog fetches assignments again. Regression checks exercise the actual staff details dialog for doctors, TAs and assistant lecturers in both languages, as well as the production query validation rules. This display fix does not require reassigning courses or changing quiz permissions.

The dashboard and teaching quiz selector load `GET /api/staff/me/assigned-courses` using the signed-in staff identity. Explicit doctor, TA and assistant lecturer assignments are recognized consistently, including legacy single IDs, string IDs and embedded staff records. Names alone never grant access. Course metadata edits omit unchanged assignment fields. Explicit reassignment/removal clears legacy references too.

New quizzes with a closing time default to automatic marks release and manual answer review. The create form supplies a Cairo closing time and sends both modes explicitly. Existing saved release modes are preserved; an absent mode on an existing quiz remains manual. Older API clients creating quizzes without a closing time retain manual release.

## VPS investigation

The code fixes do not prove what happened to the VPS database. A container restart does not intentionally delete assignments. All missing courses can also indicate a different database, inactive courses, a failed request, or an old deployed API/web image. Request failures now display an error and retry action instead of appearing to be zero assignments.

After transferring these changes to the VPS, rebuild both services from the project directory:

```bash
cd ~/app
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build --wait api web
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
```

Run this read-only diagnostic inside the rebuilt API container:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T api node dist/database/audit-course-assignments.js
```

It reports database name and counts of courses, active courses, stored links, staff accounts and unresolved references. It does not print credentials or staff details. Check that the database name is the expected one. Zero stored links requires checking backups or restoring assignments through course management; rebuilding cannot reconstruct deleted links. Nonzero stored links with an empty staff page requires inspecting that account's assigned-courses request and API logs. A 401/403 is an authentication/permission issue; a 200 with an empty array means no matching active assignments were found.

No seed, database reset, backfill or VPS timezone change is required. API release checks compare timestamps; Cairo conversion is handled by the form. Berlin as the host's display timezone does not alter a synchronized UTC clock.
