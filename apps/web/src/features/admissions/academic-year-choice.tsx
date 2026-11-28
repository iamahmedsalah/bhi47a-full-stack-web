"use client";

import type { ComponentProps } from "react";
import { AcademicYearSelect } from "@/components/ui/academic-year-select";

export function AcademicYearChoice(
  props: Omit<ComponentProps<typeof AcademicYearSelect>, "admission">,
) {
  return <AcademicYearSelect {...props} admission />;
}
