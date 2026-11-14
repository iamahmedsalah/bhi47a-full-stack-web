# MongoDB diagnostics table

The admin metrics page reuses the same table shell as **All routes performance** for MongoDB diagnostics: theme colors, header/icon, KPI surfaces, latency badges, selection, CSV export, pagination and the three-dot details menu.

## Views and filters

- **Recent failures:** the retained failure-event buffer, with search, command, category, event type, duration threshold and newest/oldest/slowest sorting.
- **Command summary:** process-lifetime command attempts, failures, mean duration and maximum duration. Sort by attempts, failure count or maximum duration. Its duration threshold applies to the maximum duration.
- Search also matches stage, request ID, safe error code/class and translated failure/event labels in the failures view.
- All diagnostics filter parameters use the `driver` prefix in the URL. Changes reset only the diagnostics page. Clearing diagnostics filters preserves other metrics-table filters.
- Filter changes are client-side and do not submit these parameters to the API. The existing metrics refresh policy is unchanged.

The six connection KPIs always represent the current API process; table filters do not alter their totals. Command totals and failure events are different measurements: one failed operation can appear in both driver and Mongoose events. The retained buffer is limited to 50 events and is not a complete incident history.

## Selection, details and export

The shared table displays 25 rows per page. Checkboxes select rows for export; the header CSV action exports the selected matching rows, or all currently filtered rows if none are selected. Per-row export and details remain in a three-dot menu. CSV uses the existing exporter with a UTF-8 BOM.

Failure details retain duration, Cairo time, event type, operation, sanitized error class/code, stage, request correlation and checkout reason when available. Command details show counters and related retained events. No deletion or diagnostic mutation is added.

Arabic and English labels are under `mongoDiagnostics` in the existing locale files. Controls/portals and dialogs respect RTL; technical values are isolated with `<bdi>`. Empty filtered results, no recorded failures and unavailable diagnostics from older API versions have separate messages.

No backend metric definitions, retention rules, endpoints, permissions, database settings or deployments are changed.

## Checks

```powershell
node --test apps/web/tests/driver-diagnostics.test.mjs apps/web/tests/unified-metrics.test.mjs
node apps/web/tests/driver-diagnostics.browser.mjs
node scripts/performance-ui.browser.cjs
```

The browser checks require a built local web server on `127.0.0.1:3012` (or a localhost `PERF_UI_BASE_URL`). API and image responses are synthetic/intercepted. They check functionality and responsive layout, not production performance. Screenshots/CSV fixtures go to ignored `outputs/performance` files.

Validation completed:

- Workspace lint and typechecking passed. The final edited frontend files also passed focused lint checks.
- Workspace production build passed for shared/API/web, including the final layout and installed Radix direction handling.
- API regression: **99 suites / 962 tests passed**.
- Driver filtering/identity and existing metrics model checks: **7 tests passed**.
- Arabic/English browser checks passed: pagination, combined filters, clearing filters without losing other tables' URL state, reload persistence, selected CSV with BOM/optional columns, row details and RTL menus, command summary, empty/unavailable API data and responsive layout.
- Existing metrics/session-gate browser checks passed in both languages, including anonymous redirects without protected feature requests.
- Arabic and English desktop/mobile screenshots were inspected. The final layout keeps the export action opposite the desktop heading and uses two-column cards/controls on mobile. The table scrolls within its own container.
- API runtime configuration, built root-route artifacts and whitespace checks passed.

Database E2E was attempted but stopped at its localhost MongoDB preflight because the local service is unavailable. No production connection or deployment was performed.
