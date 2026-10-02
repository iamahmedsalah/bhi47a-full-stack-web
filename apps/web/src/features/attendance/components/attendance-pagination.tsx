"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomDropdown } from "@/components/ui/custom-dropdown";

export function AttendancePagination({
  page,
  limit,
  total,
  totalPages,
  onPage,
  onLimit,
  isArabic,
  disabled,
}: {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  onPage: (page: number) => void;
  onLimit?: (limit: number) => void;
  isArabic: boolean;
  disabled?: boolean;
}) {
  const count = (value: number) =>
    value.toLocaleString(isArabic ? "ar-EG" : "en-GB");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 p-4 text-xs text-muted-foreground">
      <span>
        {total
          ? `${count((page - 1) * limit + 1)}–${count(Math.min(page * limit, total))}`
          : count(0)}{" "}
        {isArabic ? "من" : "of"} {count(total)}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {onLimit && (
          <CustomDropdown
            value={String(limit)}
            onValueChange={(value) => onLimit(Number(value))}
            options={[10, 20, 50, 100].map((value) => ({
              value: String(value),
              label: `${count(value)} ${isArabic ? "لكل صفحة" : "per page"}`,
            }))}
            ariaLabel={isArabic ? "عدد السجلات في الصفحة" : "Rows per page"}
            disabled={disabled}
            className="w-36"
          />
        )}
        <nav
          aria-label={isArabic ? "صفحات الحضور" : "Attendance pagination"}
          className="flex items-center gap-2"
        >
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-9 w-9"
            aria-label={isArabic ? "الصفحة السابقة" : "Previous page"}
            disabled={disabled || page <= 1}
            onClick={() => onPage(page - 1)}
          >
            {isArabic ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
          <span className="whitespace-nowrap tabular-nums">
            {count(page)} / {count(Math.max(1, totalPages))}
          </span>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-9 w-9"
            aria-label={isArabic ? "الصفحة التالية" : "Next page"}
            disabled={disabled || page >= totalPages}
            onClick={() => onPage(page + 1)}
          >
            {isArabic ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </nav>
      </div>
    </div>
  );
}
