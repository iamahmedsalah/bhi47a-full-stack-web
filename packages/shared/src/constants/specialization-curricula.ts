import type { CourseCurriculum } from "./course-curricula";

/** Transcribed from the two supplied 2026/2027 official programme PDFs.
 * Accounting level 4 is not present in the supplied document. */
export const APPROVED_SPECIALIZATION_CURRICULA: Readonly<
  Record<string, readonly CourseCurriculum[]>
> = {
  "317": [
    {
      department: "ACCOUNTING",
      academicLevel: "3",
      semester: "first",
      type: "required",
    },
    {
      department: "BIS",
      academicLevel: "3",
      semester: "first",
      type: "required",
    },
  ],
  "411": [
    {
      department: "ACCOUNTING",
      academicLevel: "3",
      semester: "first",
      type: "required",
    },
    {
      department: "BIS",
      academicLevel: "3",
      semester: "first",
      type: "required",
    },
  ],
  "318": [
    {
      department: "ACCOUNTING",
      academicLevel: "3",
      semester: "second",
      type: "required",
    },
    {
      department: "BIS",
      academicLevel: "3",
      semester: "second",
      type: "required",
    },
  ],
  "319": [
    {
      department: "ACCOUNTING",
      academicLevel: "3",
      semester: "second",
      type: "required",
    },
    {
      department: "BIS",
      academicLevel: "3",
      semester: "second",
      type: "required",
    },
  ],
  "326": [
    {
      department: "ACCOUNTING",
      academicLevel: "3",
      semester: "first",
      type: "elective",
    },
    {
      department: "BIS",
      academicLevel: "3",
      semester: "second",
      type: "elective",
    },
  ],
  A11: [
    {
      department: "ACCOUNTING",
      academicLevel: "3",
      semester: "first",
      type: "required",
    },
  ],
  B11: [
    {
      department: "ACCOUNTING",
      academicLevel: "3",
      semester: "first",
      type: "required",
    },
  ],
  A12: [
    {
      department: "ACCOUNTING",
      academicLevel: "3",
      semester: "second",
      type: "required",
    },
  ],
  A13: [
    {
      department: "ACCOUNTING",
      academicLevel: "3",
      semester: "second",
      type: "required",
    },
  ],
  A26: [
    {
      department: "ACCOUNTING",
      academicLevel: "3",
      semester: "second",
      type: "elective",
    },
  ],
  "425": [
    {
      department: "ACCOUNTING",
      academicLevel: "3",
      semester: "second",
      type: "elective",
    },
  ],
  S11: [
    {
      department: "BIS",
      academicLevel: "3",
      semester: "first",
      type: "required",
    },
  ],
  S12: [
    {
      department: "BIS",
      academicLevel: "3",
      semester: "first",
      type: "required",
    },
  ],
  "515": [
    {
      department: "BIS",
      academicLevel: "3",
      semester: "first",
      type: "elective",
    },
  ],
  S13: [
    {
      department: "BIS",
      academicLevel: "3",
      semester: "second",
      type: "required",
    },
  ],
  S14: [
    {
      department: "BIS",
      academicLevel: "3",
      semester: "second",
      type: "required",
    },
  ],
  "422": [
    {
      department: "BIS",
      academicLevel: "3",
      semester: "second",
      type: "elective",
    },
  ],
  "413": [
    {
      department: "BIS",
      academicLevel: "4",
      semester: "first",
      type: "required",
    },
  ],
  "414": [
    {
      department: "BIS",
      academicLevel: "4",
      semester: "first",
      type: "required",
    },
  ],
  S15: [
    {
      department: "BIS",
      academicLevel: "4",
      semester: "first",
      type: "required",
    },
  ],
  S16: [
    {
      department: "BIS",
      academicLevel: "4",
      semester: "first",
      type: "required",
    },
  ],
  S21: [
    {
      department: "BIS",
      academicLevel: "4",
      semester: "first",
      type: "elective",
    },
  ],
  "412": [
    {
      department: "BIS",
      academicLevel: "4",
      semester: "first",
      type: "required",
    },
  ],
  "315": [
    {
      department: "BIS",
      academicLevel: "4",
      semester: "second",
      type: "required",
    },
  ],
  "512": [
    {
      department: "BIS",
      academicLevel: "4",
      semester: "second",
      type: "required",
    },
  ],
  S17: [
    {
      department: "BIS",
      academicLevel: "4",
      semester: "second",
      type: "required",
    },
  ],
  S22: [
    {
      department: "BIS",
      academicLevel: "4",
      semester: "second",
      type: "elective",
    },
  ],
  S23: [
    {
      department: "BIS",
      academicLevel: "4",
      semester: "second",
      type: "elective",
    },
  ],
};

export function approvedCourseCurricula(
  code: string,
  level?: string,
): CourseCurriculum[] {
  return (APPROVED_SPECIALIZATION_CURRICULA[code.trim().toUpperCase()] ?? [])
    .filter((item) => !level || item.academicLevel === level)
    .map((item) => ({ ...item }));
}
