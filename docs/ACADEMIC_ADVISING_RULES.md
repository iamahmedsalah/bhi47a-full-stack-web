# Academic Advising Required Rules

## Purpose

The student registration page shows **Advising Required** when the active GPA registration rule requires advisor approval. The decision is calculated by the API; the browser cannot bypass it.

إشعار **إرشاد أكاديمي مطلوب** يظهر عندما تقرر قاعدة التسجيل المطابقة لمعدل الطالب أن التسجيل يحتاج إلى موافقة المرشد. القرار والتحقق يتمان في الـAPI وليس في الواجهة فقط.

## Where administrators manage the rules

Open:

`Admin → System Settings → Academic Registration Rules (GPA)`

`المشرف → إعدادات النظام البوابة → قواعد التسجيل الأكاديمي (GPA)`

Every active GPA range controls:

- Minimum and maximum GPA.
- Minimum and maximum credit hours.
- Minimum and maximum number of courses.
- Whether that GPA range itself requires advisor approval.
- Whether failed courses require advising.
- Whether academic warnings require advising and the minimum warning count.
- Whether incomplete/IC course completions require advising.
- Whether graduation-plan exceptions require advising.
- Whether every summer registration requires advising.
- Whether a new student with no academic history is exempt from the GPA trigger.

كل نطاق معدل نشط يتحكم في:

- أقل وأقصى معدل تراكمي.
- أقل وأقصى عدد ساعات معتمدة.
- أقل وأقصى عدد مقررات.
- هل نطاق المعدل نفسه يحتاج موافقة المرشد.
- هل وجود مقررات راسبة يحتاج إرشادًا.
- هل الإنذارات الأكاديمية تحتاج إرشادًا، ومن أي عدد تبدأ.
- هل مقررات IC أو الاستكمال غير المكتمل تحتاج إرشادًا.
- هل استثناءات خطة التخرج تحتاج إرشادًا.
- هل كل التسجيل الصيفي يحتاج إرشادًا.
- هل يُعفى الطالب الجديد الذي لا يملك تاريخًا أكاديميًا من شرط المعدل.

## Decision flow

1. The API calculates GPA from published grades and course credit hours.
2. It selects the active rule whose GPA range contains the calculated GPA.
3. It evaluates only the advising triggers enabled on that rule.
4. If any enabled trigger matches, direct registration is locked and an advising request/case is used.
5. The advisor prepares and approves the plan in **Admin → Academic Advising**.
6. The student confirms the approved plan once. The final registration remains read-only for that academic year and semester only.

## Default behavior for existing rules

Older database rules that do not yet contain the new fields use safe compatibility defaults:

- Failed courses: required.
- Academic warnings: required from one warning.
- Incomplete/IC courses: required.
- Graduation-plan exceptions: required.
- All summer registration: not required unless enabled.
- New students: exempt from the GPA trigger when they have no grades, completed courses, failed courses, or warnings.

Saving an old rule from System Settings writes the selected values explicitly.

## Important operational rules

- Keep GPA ranges complete and non-overlapping where possible, for example `0.00–1.99` and `2.00–4.00`.
- Only active rules participate in the decision.
- If no active GPA range matches the student, no hidden advising trigger is applied; administrators should keep the active ranges covering `0.00–4.00`.
- Opening a registration semester does not bypass advising requirements.
- A final registration locks only the matching academic year and semester; it does not block the next semester.
- The legacy `/admin/registrations` screen is retired. Old links redirect to `/admin/academic-advising`.
- Registration API endpoints remain because Academic Advising and the student registration/print workflow depend on them.

## Main implementation files

- `apps/api/src/modules/registrations/schemas/gpa-registration-rule.schema.ts`
- `apps/api/src/modules/registrations/dto/registration.dto.ts`
- `apps/api/src/modules/registrations/registrations.service.ts`
- `apps/web/src/app/[locale]/admin/settings/page.tsx`
- `apps/web/src/app/[locale]/dashboard/registration/page.tsx`
- `apps/web/src/app/[locale]/admin/academic-advising/page.tsx`
