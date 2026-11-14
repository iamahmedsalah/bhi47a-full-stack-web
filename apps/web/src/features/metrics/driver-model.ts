import type { MetricsSummaryResponse } from "./api";

export type DriverDiagnostics = NonNullable<
  MetricsSummaryResponse["database"]["driverDiagnostics"]
>;
export type DriverFailure = DriverDiagnostics["recentFailures"][number];
export type DriverFailureRow = DriverFailure & { _id: string };
export type DriverCommandRow = DriverDiagnostics["commands"][number] & {
  _id: string;
};

export const DRIVER_CATEGORIES = [
  "socket_timeout",
  "server_selection",
  "checkout_timeout",
  "execution_timeout",
  "operation_timeout",
  "authentication",
  "authorization",
  "dns",
  "network",
  "topology",
  "pool_cleared",
  "other",
] as const;
export const DRIVER_KINDS = [
  "command",
  "operation",
  "checkout",
  "heartbeat",
] as const;
export const DRIVER_FILTER_DEFAULTS = {
  driverView: "failures",
  driverSearch: "",
  driverCommand: "all",
  driverCategory: "all",
  driverKind: "all",
  driverThreshold: "0",
  driverSort: "latest",
  driverPage: "1",
};
export type DriverFilters = typeof DRIVER_FILTER_DEFAULTS;
export const driverCategory = (category: string) =>
  DRIVER_CATEGORIES.find((key) => key === category) ?? "other";

export function buildDriverFailures(
  data?: DriverDiagnostics,
): DriverFailureRow[] {
  const occurrences = new Map<string, number>();
  return (data?.recentFailures ?? []).map((sample) => {
    const key = JSON.stringify([
      sample.timestamp,
      sample.kind,
      sample.command,
      sample.operation,
      sample.category,
      sample.code,
      sample.requestId,
      sample.durationMs,
      sample.stage,
      sample.checkoutReason,
    ]);
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    return {
      ...sample,
      // Keep optional columns present for CSV exports, regardless of the first
      // retained event's type (for example a command before a checkout failure).
      operation: sample.operation,
      code: sample.code,
      requestId: sample.requestId,
      stage: sample.stage,
      checkoutReason: sample.checkoutReason,
      _id: `failure:${key}:${occurrence}`,
    };
  });
}

export function buildDriverCommands(
  data?: DriverDiagnostics,
): DriverCommandRow[] {
  return (data?.commands ?? []).map((command) => ({
    ...command,
    _id: `command:${command.command}`,
  }));
}

function threshold(value: string) {
  return ["100", "1000", "10000"].includes(value) ? Number(value) : 0;
}

export function filterDriverFailures(
  rows: DriverFailureRow[],
  filters: DriverFilters,
  labels: (row: DriverFailureRow) => string = () => "",
) {
  const search = filters.driverSearch.trim().toLocaleLowerCase();
  return rows
    .filter((row) => {
      if (
        filters.driverCommand !== "all" &&
        row.command !== filters.driverCommand
      )
        return false;
      if (
        filters.driverCategory !== "all" &&
        driverCategory(row.category) !== filters.driverCategory
      )
        return false;
      if (filters.driverKind !== "all" && row.kind !== filters.driverKind)
        return false;
      if (row.durationMs < threshold(filters.driverThreshold)) return false;
      return (
        !search ||
        [
          row.command,
          row.operation,
          row.category,
          row.errorName,
          row.code,
          row.requestId,
          row.stage,
          row.checkoutReason,
          labels(row),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(search)
      );
    })
    .sort((a, b) => {
      if (filters.driverSort === "slowest")
        return (
          b.durationMs - a.durationMs || b.timestamp.localeCompare(a.timestamp)
        );
      if (filters.driverSort === "oldest")
        return a.timestamp.localeCompare(b.timestamp);
      return b.timestamp.localeCompare(a.timestamp);
    });
}

export function filterDriverCommands(
  rows: DriverCommandRow[],
  filters: DriverFilters,
) {
  const search = filters.driverSearch.trim().toLocaleLowerCase();
  return rows
    .filter(
      (row) =>
        (filters.driverCommand === "all" ||
          row.command === filters.driverCommand) &&
        (!search || row.command.toLocaleLowerCase().includes(search)) &&
        row.maxMs >= threshold(filters.driverThreshold),
    )
    .sort((a, b) => {
      if (filters.driverSort === "slowest")
        return b.maxMs - a.maxMs || b.count - a.count;
      if (filters.driverSort === "failures")
        return b.failures - a.failures || b.count - a.count;
      return b.count - a.count || a.command.localeCompare(b.command);
    });
}
