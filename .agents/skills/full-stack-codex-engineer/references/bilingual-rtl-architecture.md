# Bilingual & RTL/LTR Architecture Standards

This reference governs internationalization, Arabic RTL layout mechanics, bilingual entity data models, bidirectional text isolation, and headless UI portal localization for the Student Portal.

---

## 1. RTL, Modal & Portal Directionality Standards

### A. RTL Modal Dialogs (`DialogHeader` & `DialogFooter`)
1. **Natural Reading Direction in Arabic:**
   - In Arabic views (`dir="rtl"`), modal actions must follow the natural Arabic reading flow (primary confirmation button at the right/start, secondary cancel button following).
   - `DialogFooter` must support RTL explicitly via `rtl:sm:justify-start` and logical spacing (e.g. `gap-2` instead of directional `space-x-2` which breaks in RTL).
2. **Dialog Header Alignment:**
   - Avoid hardcoded `sm:text-left` in `DialogHeader` or `DialogTitle`. Use logical `text-start` or explicit `sm:text-start rtl:sm:text-right`.

### B. Radix Portaled Components (`DropdownMenuContent`, `SelectContent`, `PopoverContent`, `TooltipContent`)
1. **Direction Inheritance in Portals:**
   - Radix primitives render content inside `document.body` via React Portals, escaping the parent DOM tree.
   - All portaled floating containers **MUST** explicitly pass `dir="rtl"` when the active locale is Arabic (e.g. `<DropdownMenuContent dir={isRtl ? 'rtl' : 'ltr'}>` or via locale direction context).
2. **Item Alignment & Icon Anchoring:**
   - In RTL mode, dropdown items must align to the right: icons anchored at the start (right edge), text labels aligned right, and keyboard shortcuts anchored at the end (left edge).
   - Never allow left-hanging icons in Arabic dropdown menus.

---

## 2. LTR Field Isolation in RTL Layouts & Bidirectional Text

### A. Numeric, Code & Technical Input Fields
Fields that contain technical codes, identifiers, or western formatting **MUST** be explicitly forced to `dir="ltr"` and `text-left` even within an Arabic RTL page:
- `studentCode` (e.g. `202601`, `BHI-2026-001`)
- `nationalId` (14 digits)
- `phoneNumber` / `guardianPhone` (`+20 10...`)
- `email` (e.g. `student@bhi.edu.eg`)
- Passwords & OTP input tokens
- URLs, IP addresses, and MongoDB ObjectIds / UUIDs

*Why:* In an RTL container without `dir="ltr"`, input text like `-2026-001` jumps around, plus signs on phone numbers swap sides (`01012345678+`), and password dots render backwards.

### B. Inline Bidirectional Text Isolation (`<bdi>`)
When displaying codes, numbers, or English abbreviations inside Arabic text sentences, always wrap them in `<bdi>` (Bidirectional Isolation) tags or use unicode isolation characters:
```tsx
{/* Correct: Isolated bidirectional display */}
<p>
  تم تسجيل الطالب بنجاح برقم قيد: <bdi className="font-mono font-bold text-teal-600">{student.studentCode}</bdi>
</p>
<p>
  رقم الهاتف: <bdi dir="ltr">{student.phone}</bdi>
</p>
```

---

## 3. Bilingual Entity Data Models (Arabic & English)

### A. Schema Dual-Language Properties
Core institutional entities support dual-language naming in schemas and DTOs:
- **Students / Users:** `fullName` (English/official) and `fullNameAr` (Arabic)
- **Courses:** `name` / `nameAr`, `code` (e.g. `CS101`), `description` / `descriptionAr`
- **Departments / Specializations:** `name` / `nameAr`, `code` (e.g. `BIS`, `CS`)
- **Staff / Faculty:** `fullName` / `fullNameAr`, `title` / `titleAr`

### B. Display Resolution Logic
When rendering entity names in the UI, prioritize the active locale with safe fallback:
```typescript
export function getLocalizedEntityName(
  entity: { name?: string; nameAr?: string; fullName?: string; fullNameAr?: string },
  locale: 'ar' | 'en'
): string {
  if (locale === 'ar') {
    return entity.fullNameAr || entity.nameAr || entity.fullName || entity.name || '';
  }
  return entity.fullName || entity.name || entity.fullNameAr || entity.nameAr || '';
}
```

---

## 4. Status Badges, Enums & Dates Localization

### A. Zero Untranslated Enums
- Never render raw backend enum strings in the UI (e.g. `COMPLETED`, `ACTIVE`, `PENDING`, `DISMISSED`, `IN_REVIEW`, `FAILED`).
- All status badges must pass enums through `next-intl` translation keys:
  ```json
  // messages/ar.json
  "statuses": {
    "ACTIVE": "نشط",
    "INACTIVE": "غير نشط",
    "SUSPENDED": "موقوف",
    "PENDING": "قيد الانتظار",
    "RESOLVED": "تم الحل",
    "CLOSED": "مغلق"
  }
  ```
- Component `StatusBadge` must automatically resolve status keys against the active locale dictionary.

### B. Localized Date & Time Formatting (Africa/Cairo Timezone)
1. **Consistent Timezone:** The official timezone for the institute is `Africa/Cairo` (`UTC+2` / `UTC+3` DST).
2. **Localized Formatter:**
   - Arabic: formatted with `ar-EG` locale (or `ar-EG-u-nu-latn` if Latin digits are preferred for clarity in financial tables).
   - English: formatted with `en-GB` or `en-US`.
   - Never format dates using naive `.toLocaleDateString()` without specifying locale and timeZone.
   - Example helper:
     ```typescript
     export function formatPortalDate(date: string | Date, locale: string = 'ar'): string {
       return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
         timeZone: 'Africa/Cairo',
         year: 'numeric',
         month: 'short',
         day: 'numeric',
       }).format(new Date(date));
     }
     ```

---

## 5. CSS & Typography Considerations for Arabic RTL

1. **Logical Properties Over Physical:**
   - Use `ms-*` (margin-inline-start) and `me-*` (margin-inline-end) instead of `ml-*` and `mr-*`.
   - Use `ps-*` and `pe-*` instead of `pl-*` and `pr-*`.
   - Use `start-0` / `end-0` instead of `left-0` / `right-0`.
2. **Line-Height (Leading) for Arabic Fonts:**
   - Arabic typefaces (e.g. Cairo, Tajawal, IBM Plex Sans Arabic) have taller ascenders and descenders than Latin typefaces.
   - Avoid tight line heights like `leading-none` or `leading-3` on Arabic text as they cause diacritics and dots to get clipped. Use `leading-relaxed` or `leading-normal`.
3. **Icons Flipping:**
   - Directional icons (e.g. `ArrowLeft`, `ArrowRight`, `ChevronLeft`, `ChevronRight`) must flip dynamically using `rtl:rotate-180` or locale-aware icon wrappers.
   - Non-directional icons (e.g. `Search`, `User`, `Calendar`, `Settings`) must **NOT** be flipped.
