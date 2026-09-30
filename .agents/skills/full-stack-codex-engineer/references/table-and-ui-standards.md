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


