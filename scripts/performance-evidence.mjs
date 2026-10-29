import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function parseCsv(text) {
  const rows = [];
  let row = [],
    value = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  if (quoted) throw new Error("Unterminated CSV string");
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  const header = rows.shift() ?? [];
  return rows.map((row) =>
    Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""])),
  );
}
const numeric = (value) =>
  value === "" || value === undefined ? null : Number(value);
const knownRoutes = new Set([
  "/api/admin/complaints",
  "/api/students/me/quizzes",
  "/api/students/me/syllabi",
  "/api/registration/eligibility",
  "/api/auth/heartbeat",
  "/api/students/me/notifications",
  "/api/auth/google/nonce",
  "/api/auth/student/login",
  "/api/auth/me",
]);
function safeRoute(value) {
  return value
    .split("?")[0]
    .replace(/[a-f\d]{24,64}/gi, ":id")
    .replace(/\b\d{5,}\b/g, ":number")
    .slice(0, 180);
}
function traces(value) {
  try {
    const item = JSON.parse(value);
    return Array.isArray(item) ? item : [item];
  } catch {
    return [];
  }
}
function summarizeRoute(row) {
  const samples = traces(row.Traces).filter(
    (trace) => trace && typeof trace === "object",
  );
  return {
    route: safeRoute(row.Route),
    method: row.Method,
    lifetime: {
      calls: numeric(row["Lifetime Calls"]),
      meanMs: numeric(row["Avg Ms"]),
      maxMs: numeric(row["Max Ms"]),
      statuses: JSON.parse(row.Statuses || "{}"),
    },
    window: {
      duration: row.Window,
      calls: numeric(row["Window Calls"]),
      p95Ms: numeric(row["P95 Ms"]),
      clientErrors: numeric(row.Window4xx),
      serverErrors: numeric(row.Window5xx),
    },
    sampledTraces: samples.map((trace) => ({
      durationMs: trace.durationMs,
      databaseOperations: trace.databaseOperations,
      summedDatabaseMs: trace.summedDatabaseMs,
      sessionReads: trace.operationCounts?.["auth_sessions.findOne"] ?? 0,
      userReads: trace.operationCounts?.["users.findOne"] ?? 0,
      courseReads: trace.operationCounts?.["courses.find"] ?? 0,
      stages: Object.fromEntries(
        Object.entries(trace.stages ?? {}).filter(([name]) =>
          /^(?:auth\.|complaints\.|registration\.|response\.serialization)/.test(
            name,
          ),
        ),
      ),
    })),
  };
}
export async function summarizeEvidence(directory) {
  const names = [
    "unified-database.csv",
    "unified-routes.csv",
    "unified-routes (1).csv",
    "prometheus-metrics-2026-10-29-20-05-11.txt",
    "api_performance_audit_2026-10-29.md",
  ];
  const files = await Promise.all(
    names.map(async (name) => ({
      name,
      text: await readFile(path.join(directory, name), "utf8"),
    })),
  );
  const database = parseCsv(files[0].text);
  const first = parseCsv(files[1].text);
  const second = parseCsv(files[2].text);
  const secondByRoute = new Map(second.map((row) => [row.Route, row]));
  const diffs = [];
  for (const row of first) {
    const other = secondByRoute.get(row.Route);
    if (!other) continue;
    const changed = Object.keys(row).filter(
      (key) => !["_id", "Traces"].includes(key) && row[key] !== other[key],
    );
    if (changed.length)
      diffs.push({
        route: safeRoute(row.Route),
        fields: Object.fromEntries(
          changed.map((key) => [key, [row[key], other[key]]]),
        ),
      });
  }
  const scalar = {};
  const gc = {};
  for (const line of files[3].text.split(/\r?\n/)) {
    const match = line.match(
      /^(student_portal_[a-zA-Z0-9_]+)(\{[^}]*\})?\s+([-+\d.eE]+)(?:\s|$)/,
    );
    if (!match) continue;
    const [, name, labels, value] = match;
    if (/^student_portal_mongodb_pool_checkout_seconds_(?:sum|count)$/.test(name) && labels === '{outcome="success"}') scalar[name] = Number(value);
    if (
      !labels &&
      /(?:eventloop|heap_size|resident_memory|external_memory|pool_checkout_seconds_(?:sum|count)$|pool_checked_out$|pool_waiters$|process_start_time|process_cpu_seconds_total$)/.test(
        name,
      )
    )
      scalar[name] = Number(value);
    if (/nodejs_gc_duration_seconds_(?:sum|count)$/.test(name)) {
      const kind = labels?.match(/kind="([a-z_]+)"/)?.[1] ?? "unknown";
      gc[kind] ??= {};
      gc[kind][name.endsWith("_sum") ? "totalSeconds" : "count"] =
        Number(value);
    }
  }
  const checkoutCount =
    scalar.student_portal_mongodb_pool_checkout_seconds_count;
  return {
    sources: files.map((file) => ({
      name: file.name,
      bytes: Buffer.byteLength(file.text),
      sha256: createHash("sha256").update(file.text).digest("hex"),
    })),
    populations: {
      routeRows: first.length,
      secondRouteRows: second.length,
      slowDatabaseGroups: database.length,
      note: "Lifetime HTTP counters, five-minute route histograms, and thresholded slow-query observations are different populations. No rates or before/after production gains can be inferred from one scrape.",
    },
    routes: first
      .filter((row) => knownRoutes.has(row.Route.replace(/^[A-Z]+\s+/, "")))
      .map(summarizeRoute),
    routeExportDifferences: diffs,
    slowDatabase: database
      .map((row) => ({
        collection: row.Collection,
        operation: row.Operation,
        slowCount: numeric(row.Count),
        conditionalMeanMs: numeric(row["Avg Ms"]),
        maxMs: numeric(row["Max Ms"]),
        coldStartCount: numeric(row["Cold Start Count"]),
      }))
      .sort((a, b) => b.slowCount - a.slowCount),
    runtime: scalar,
    gcLifetime: gc,
    meanPoolCheckoutMs: checkoutCount
      ? (scalar.student_portal_mongodb_pool_checkout_seconds_sum /
          checkoutCount) *
        1000
      : null,
    limitations: [
      "No repeated scrape interval for counter rates",
      "No production query plans, CPU profiles, heap snapshots, or lock-wait evidence",
      "Trace examples are selected slow samples, not representative traffic",
    ],
  };
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const [directory, output] = process.argv.slice(2);
  if (!directory || !output)
    throw new Error(
      "Usage: node performance-evidence.mjs INPUT_DIRECTORY OUTPUT_JSON",
    );
  const summary = await summarizeEvidence(directory);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(summary, null, 2) + "\n");
  console.log(
    `Summarized ${summary.populations.routeRows} routes and ${summary.populations.slowDatabaseGroups} slow-query groups; raw query values and identities omitted.`,
  );
}
