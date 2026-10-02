import assert from "node:assert/strict";
import { test, after } from "node:test";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Render the actual page and table. Only the network and URL hooks use fixtures.
const base = path.resolve(__dirname, "../src");
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
const originalExtensions = {
  ts: require.extensions[".ts"],
  tsx: require.extensions[".tsx"],
};
const session = {
  _id: "session-1",
  courseCode: "315",
  courseName: "Human resources",
  level: "4",
  sessionType: "lecture",
  academicPosition: "doctor",
  createdByName: "Lecturer",
  startsAt: "2026-10-02T19:40:00Z",
  status: "CLOSED",
  stats: { totalCheckedIn: 1, presentCount: 1, lateCount: 0 },
};
const overview = {
  sessions: [session, { ...session, _id: "session-2", status: "OPEN" }],
  kpi: {
    totalSessions: 2,
    activeSessions: 1,
    totalCheckedIn: 2,
    presentCount: 2,
    lateCount: 0,
  },
  total: 2,
  page: 1,
  limit: 20,
  totalPages: 1,
  filters: {
    levels: ["4"],
    courses: [{ code: "315", name: "Human resources", level: "4" }],
  },
};
Module._resolveFilename = function (request, parent, ...rest) {
  return originalResolve.call(
    this,
    request.startsWith("@/") ? path.join(base, request.slice(2)) : request,
    parent,
    ...rest,
  );
};
Module._load = function (request, parent, ...rest) {
  if (request === "@tanstack/react-query")
    return {
      keepPreviousData: (value) => value,
      useQuery: ({ queryKey }) => ({
        data: queryKey[0] === "attendance-sessions" ? overview : undefined,
        refetch() {},
      }),
    };
  if (request === "@/hooks/use-table-state")
    return {
      useTableState: () => ({
        page: 1,
        limit: 20,
        search: "",
        filters: { status: "all", level: "all", courseCode: "all" },
        setSearch() {},
        setFilter() {},
        setPage() {},
        setLimit() {},
        resetAll() {},
      }),
    };
  if (request.endsWith("/api/attendance-api")) return { attendanceApi: {} };
  if (request === "@/lib/api")
    return { getApiErrorDetails: () => ({ message: "Test error" }) };
  return originalLoad.call(this, request, parent, ...rest);
};
for (const extension of [".ts", ".tsx"])
  require.extensions[extension] = (module, filename) => {
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        target: ts.ScriptTarget.ES2022,
      },
    });
    module._compile(output.outputText, filename);
  };
after(() => {
  Module._resolveFilename = originalResolve;
  Module._load = originalLoad;
  require.extensions[".ts"] = originalExtensions.ts;
  require.extensions[".tsx"] = originalExtensions.tsx;
});
const {
  AdminAttendanceOverview,
} = require("../src/features/attendance/components/admin-attendance-overview.tsx");

for (const isArabic of [false, true])
  test(`attendance rows have eight aligned cells and valid HTML (${isArabic ? "Arabic" : "English"})`, () => {
    const html = renderToStaticMarkup(
      React.createElement(AdminAttendanceOverview, {
        isArabic,
        onOpenSessionPresenter() {},
      }),
    );
    const body = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)[1];
    const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
    assert.equal(rows.length, 2);
    for (const [, row] of rows) {
      const cells = [...row.matchAll(/<td\b[^>]*>[\s\S]*?<\/td>/g)];
      assert.equal(cells.length, 8);
      assert.equal(
        row.replace(/<td\b[^>]*>[\s\S]*?<\/td>/g, "").trim(),
        "",
        "Every direct row child must be a table cell",
      );
      assert.match(cells[0][0], /315/);
      assert.match(cells[4][0], /<time/);
      assert.match(cells[7][0], /<button/);
    }
    assert.equal([...html.matchAll(/<th\b/g)].length, 8);
  });
