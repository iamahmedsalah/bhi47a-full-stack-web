# Production-Ready Slug URL Architecture & Standards

This document establishes the architecture for human-readable URLs, SEO slugs, and identity separation across the Student Portal.

---

## 1. Core Architecture Principles

### Internal Identity vs. Human Routing Identity
- **MongoDB `_id` (ObjectId):** Internal, permanent primary key used strictly for database relationships, foreign keys, mutations, and backend joins (e.g. `courseRegistration.courseId`, `attendance.studentId`, `quiz.courseId`).
- **`slug` / Institutional Code:** Human-readable, URL-safe routing identity for frontend browser URLs.
- **Strict Rule:** **Never** replace internal database primary keys or foreign keys with slugs. Slugs are an external routing layer, not relational foreign keys.

### Entity Routing Scope
1. **Public & Academic Resources (Slug-Enabled):**
   - **Courses (`Course`):** Primary target for human-readable URLs.
     - Example: `Business Information Systems I` -> `/courses/business-information-systems-1`
   - **Departments (`Department`):** `/departments/accounting-and-finance`
   - **Announcements & News (`Announcement`):** `/announcements/fall-2026-exam-schedule-released`
   - **FAQ Categories (`FaqCategory`):** `/help/faq/academic-registration`
2. **Personal / Institutional Entities (Code-Based Routing):**
   - **Students (`Student` / `StudentProfile`):** Students possess an official unique student code (`studentCode`, e.g. `202601`).
     - *Why no personal name slugs:* Name slugs (`/students/ahmed-ali`) create mass collisions (`ahmed-ali-42`) and present critical privacy enumeration risks. Detail routes must use `/admin/students/:id` or code-based URLs `/admin/students/:studentCode`.
   - **Staff & Instructors (`StaffProfile`):** Use unique institutional staff codes (`staffCode`, e.g. `STAFF-104`).

---

## 2. Slug Generation Algorithm

Reusable deterministic slug transformation for backend and shared packages:
1. Normalize text using Unicode NFKD.
2. Convert to lowercase and trim surrounding whitespace.
3. Treat word boundaries and separators such as `&`, `+`, `|`, `/`, and `_` as spaces or hyphens.
4. Replace whitespace with a single hyphen (`-`).
5. Remove unsupported punctuation and non-alphanumeric characters (preserving Latin and optionally Arabic Unicode characters if Arabic slugs are supported, or transliterating):
   - For English/Latin slugs: `/[^a-z0-9-]/g`.
6. Collapse consecutive hyphens (`/--+/g` -> `-`).
7. Trim leading and trailing hyphens.

*Example:*
`Advanced Database Systems & Big Data | CS304` -> `advanced-database-systems-big-data-cs304`

---

## 3. Collision Resolution & Concurrency Safety

1. **Database Indexing:**
   - Slugs must have a unique compound or single index in Mongoose:
     ```typescript
     CourseSchema.index({ slug: 1 }, { unique: true, sparse: true });
     ```
2. **Deterministic Suffix Generation:**
   - If a generated slug already exists, append an incremental numeric suffix:
     - Base: `introduction-to-finance`
     - Conflict 1: `introduction-to-finance-2`
     - Conflict 2: `introduction-to-finance-3`
3. **Length Constraints:**
   - Slugs should be capped at 120 characters, reserving at least 10 characters for collision suffixes.
4. **Race Condition Handling:**
   - The unique database index acts as the final transactional guarantee. If a duplicate key error (`E11000`) occurs during concurrent inserts, catch the error and retry with the next available numeric suffix.

---

## 4. Slug Immutability

- **Stability First:** Slugs are generated upon entity creation and remain **immutable** by default.
- **Prevent Broken Links:** If an administrator edits a course title from "Introduction to MIS" to "Intro to Management Information Systems", the original slug remains intact. This prevents broken bookmarks, invalid syllabus links, and broken browser history.
- **Explicit Administrative Action:** Slug regeneration should only be permitted through an explicit admin action or checkbox ("Regenerate URL Slug"), with a warning about URL invalidation.

---

## 5. API Clarity & Route Separation

Maintain clear separation between human-readable slug resolution and internal data mutations:
- **Public / Read Detail Routes:**
  - `GET /api/courses/by-slug/:slug` -> Resolves entity by slug for Next.js page rendering.
- **Administrative / Mutation Routes:**
  - `GET /api/admin/courses/:id` -> Fetches entity by internal Mongo `ObjectId`.
  - `PATCH /api/admin/courses/:id` -> Updates entity by `ObjectId`.
  - `DELETE /api/admin/courses/:id` -> Deletes entity by `ObjectId`.
- **Breadcrumbs:**
  - UI breadcrumbs should display the human entity title (e.g. `نظم المعلومات الإدارية`), never the raw technical slug string.
