# Table and Interface Standards

Every feature table across the Student Portal must adhere to these unified UI and architectural standards to ensure visual consistency, accessibility, and high performance.

---

## 1. Table Composition & Standards

### A. Selection & Bulk Operations
- **Checkbox Column:** Features supporting bulk actions (e.g. bulk delete, bulk status update, bulk export) must include a selection column (`w-8 text-center`).
- **Theme-Aware Checkbox:** Always utilize the project's Radix-based `<Checkbox>` component. Never render raw `<input type="checkbox">`.
- **"Select All" Header:**
  - Header checkbox selects all visible rows on the current page.
  - Supports indeterminate state when a subset of rows is selected.
- **Bulk Action Bar:**
  - When one or more rows are selected, render a sticky/floating bulk action bar displaying the count of selected items (e.g. `تم تحديد 5 عناصر`).
  - Destructive bulk actions (e.g. bulk delete, bulk suspend) **MUST** require confirmation through a `<ConfirmDialog>`.
  - Provide safe execution feedback with Sonner toast notifications and automatic selection clear on completion.

### B. Actions Column (The 3-Dots Dropdown Pattern)
- **Single 3-Dots Menu (`MoreVertical`):** Restrict table row actions strictly to a single dropdown menu trigger using the `MoreVertical` icon button (`TableActionButton` / `DropdownMenu`).
- **Strict Rule:** **Never** place standalone `Pencil`, `Eye`, or `Trash` buttons directly inside table rows. Raw action buttons cause horizontal table bloat, misalignments on mobile/smaller screens, and visual clutter.
- **Action Grouping in Dropdown:**
  - Navigation / View actions at the top.
  - Edit / Modify actions in the middle.
  - Destructive / Delete actions separated at the bottom with a `<DropdownMenuSeparator>` and styled with `text-destructive`.

### C. Headless Radix Primitives Only
- Use Radix UI primitives (`@radix-ui/react-select`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-dialog`, `@radix-ui/react-popover`) for all dropdowns, modal dialogs, and filter controls.
- **Strict Rule:** **Never** render raw browser `<select>` or unstyled native form elements.
- Ensure all floating overlays respect RTL (`dir="rtl"`) when rendered in Arabic views.

### D. Lean Composition (`DataTable<T>` & `DataTableShell`)
- Avoid imperative `<table>` boilerplate inside page components.
- Compose views using reusable table shells:
  - Memoized column definitions (`useMemo`).
  - Built-in debounced search toolbar (`useDebouncedCallback`).
  - Responsive overflow wrappers (`overflow-x-auto`) with subtle scrollbars.
  - Automatic skeleton loading states matching the table column layout.
  - Standardized empty state illustrations when queries return zero results.

---

## 2. URL-Synchronized State (`useTableState`)

1. **Browser History & Deep Linking:**
   - Table state (active page `page`, items per page `limit`, active search `search`, category filters `level`, `department`, `status`, and sorting `sortBy`, `sortOrder`) must synchronize with URL search parameters.
   - Allows users to copy/paste filtered URLs, bookmark views, and use browser forward/back buttons seamlessly.
2. **Anti-Pattern:**
   - **Never** store route-specific pagination or filter state in global Zustand stores. Doing so causes state persistence bugs when navigating between different admin tables.

---

## 3. UI State Hierarchy & Feedback

Every data-driven view must implement all five fundamental UI states:
1. **Loading State:** Render animated skeletons (`<Skeleton>`) that mirror the exact shape of table rows and cards to prevent layout shifts (CLS).
2. **Empty State:** Distinct illustrated empty state when no records exist, with a helpful call-to-action (e.g. "لا يوجد طلاب مسجلين حالياً - أضف طالباً جديداً").
3. **No Results State:** Distinct state when active search/filters yield zero matches, with a "مسح عوامل التصفية" (Clear Filters) button.
4. **Error State:** Clear error alert with a retry button (`refetch`) and user-friendly error description.
5. **Success / Mutating State:** Inline spinners or disabled states on buttons during mutations, accompanied by Sonner toasts.

---

## 4. Design System Curvature (`rounded-squircle`) Standards

The Student Portal design system enforces an Apple/iOS-inspired organic squircle curvature token (`rounded-squircle`, mapped via `--radius-squircle: var(--sq-radius)` where `--sq-radius: 12px;` in CSS). Consistent application of this class creates a unified, modern, and tactile look across all interfaces.

### A. Mandatory `rounded-squircle` Element Placements
Strictly reserve `rounded-squircle` for small-to-medium interactive components and micro-elements:
1. **Buttons & Triggers:**
   - Primary, secondary, outline, ghost, and destructive buttons (`<Button>`).
   - Icon buttons (`h-9 w-9`, `h-10 w-10`, theme toggle, language switch, notification trigger).
   - Modal action triggers, tab triggers, and dropdown triggers (`<TableActionButton>`).
2. **Badges, Chips & Tags:**
   - System status badges (`<StatusBadge>`, `<Badge>`).
   - Meta chips (e.g., student level tag, course code pill, GPA indicator, carried courses chip).
   - Filter count badges and search pill filters.
3. **Form Controls & Dropdown Selects:**
   - Text inputs, search bars, and password fields (`<Input>`, `<PasswordInput>`).
   - Text areas (`<Textarea>`).
   - Select dropdown triggers (`<SelectTrigger>`), custom dropdowns (`<CustomDropdown>`), date pickers (`<DatePicker>`, `<DateTimePicker>`).

### B. Usage Rules & Anti-Patterns
- **STRICT PROHIBITION ON PARENT DIVS & MODALS:** **Never** use `rounded-squircle` on parent divs, modal dialog containers (`<DialogContent>`), drawer sheets, page header banners (`<PageTitleBanner>`), or large outer card wrappers. Applying squircle curvature formulas to large rectangular boxes with wide aspect ratios causes severe visual distortion (egg/oval warping, clipped corners, and distorted borders).
- **Large Container Standards:**
  - For modals, dialogs, drawers, and large outer hero sections/banners: Use standard geometric curvature `rounded-2xl`.
  - For cards, table containers, and intermediate content blocks: Use `rounded-xl`.
- **When to use `rounded-full`:** Strictly reserve `rounded-full` for circular user avatars (`<Avatar>`), circular icon indicators, or small circular status dots. Do not use `rounded-full` for text pills or buttons where `rounded-squircle` provides superior typographic rhythm and proportions.

---

## 5. Global Modal Shell & Surface Hierarchy Standards

All dialogs across the Student Portal (`@/components/ui/dialog` and `@/components/ui/alert-dialog`) follow one unified pure-flexbox architecture modeled after `ControlGraceDialog`:

### A. Canonical Modal Structure (`DialogHeader` + `DialogBody` + `DialogFooter`)
```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent flush dir={isAr ? "rtl" : "ltr"} className="max-w-2xl">
    <DialogHeader>
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-squircle border border-primary/30 bg-primary/15 text-primary">
          <Sparkles className="size-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <DialogTitle className="text-base sm:text-lg font-bold tracking-tight text-start">
            {/* Title */}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground text-start">
            {/* Subtitle / context */}
          </DialogDescription>
        </div>
      </div>
    </DialogHeader>

    <DialogBody>
      {/* Only this region scrolls; grouped sections use rounded-xl border border-border/60 bg-secondary/20 p-4 */}
    </DialogBody>

    <DialogFooter className="rtl:sm:justify-start">
      <Button className="rounded-squircle">{/* Primary action */}</Button>
      <Button variant="outline" className="rounded-squircle">{/* Secondary / cancel */}</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### B. Non-Negotiable Modal Layout & Surface Rules
1. **Pure Flexbox Only (No Sticky/Negative-Margin Hacks):** `DialogContent` always renders `flex flex-col gap-0 p-0 overflow-hidden max-h-[90vh] rounded-2xl border-border/80 bg-card shadow-2xl`. `DialogHeader` (`shrink-0 bg-background/60 border-b border-border/70`) and `DialogFooter` (`shrink-0 bg-background/80 border-t border-border/70`) stay fixed while only `DialogBody` scrolls. Never add outer padding (`p-6`) or `overflow-y-auto` back onto `DialogContent` when using fixed headers/footers.
2. **Calm Matte Inner Card Surface:** Inside `bg-card` modals, render grouped input sections, summary cards, and before/after comparison panels (like midterm pass-rate impact cards) with `rounded-xl border border-border/60 bg-secondary/20 p-4`, and nested sub-cards with `rounded-xl border border-border/60 bg-card/85`. Reserve subtle accent tints (`border-primary/35 bg-primary/[0.09]`, `border-amber-500/35 bg-amber-500/[0.08]`, `border-emerald-500/35 bg-emerald-500/12`) strictly for active deltas, badges, and status indicators rather than flooding whole panels in cyan/teal gradients.
3. **Multi-Stage Modals:** For complex administrative actions (preview → confirm → completed), place a compact 3-step visual progress indicator inside `DialogHeader`, render the stage content inside `DialogBody`, and keep stage actions anchored in `DialogFooter`.
4. **RTL Close & Action Alignment:** Keep `pe-12` on `DialogHeader` so the top-end close (`X`) button never collides with titles or badges, and align `DialogFooter` via `rtl:sm:justify-start` with the primary CTA first in Arabic RTL.

---

## 6. Mobile-First Student Portal UI Standard (`360px–430px` First)

Because the vast majority of students access the portal (QR attendance check-in, dashboard, quizzes, grades, login) from smartphones, **every student-facing screen and component MUST be designed Mobile-First**:
1. **Design From `360px–430px` Upward:** Always author base Tailwind classes for a single-column phone screen first, then enhance with `sm:`, `md:`, and `lg:` breakpoints.
2. **Touch-Friendly Ergonomics:** Primary actions (Scan QR, Check In, Submit, Retry) must be full-width on mobile (`w-full sm:w-auto`) with `min-h-11` (`44px`) comfortable tap targets and generous vertical spacing (`gap-3` / `space-y-3`).
3. **Zero Horizontal Overflow:** Guard against cramped badges, long course names, or wide tables pushing the viewport horizontally (`min-w-0`, `truncate`, `flex-wrap`, or horizontal snap-scroll strips for filter chips).
4. **Actionable Above-the-Fold Priority:** On student mobile dashboards, prioritize urgent live states first (Tuition Hold notice → Live QR Attendance Hub → Open Quizzes → Quick summary cards) so students never hunt across multiple pages on a phone screen.




