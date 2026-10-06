"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Printer, Download, Loader2, Globe, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type PrintableRegistrationForm,
  type RegistrationLocale,
  openRegistrationPrintView,
  downloadRegistrationPdf,
  getRegistrationCopy,
  localizeAcademicLevel,
  localizeSemester,
  localizeCourseType,
  localizeRegistrationStatus,
} from "@/lib/registration-print";

interface RegistrationSlipViewProps {
  form: PrintableRegistrationForm;
  locale: string;
}

export function RegistrationSlipView({ form, locale }: RegistrationSlipViewProps) {
  const [activeLocale, setActiveLocale] = useState<RegistrationLocale>(
    locale === "en" ? "en" : "ar",
  );
  const [isDownloading, setIsDownloading] = useState(false);

  const copy = getRegistrationCopy(activeLocale);
  const isAr = activeLocale === "ar";
  const info = form.studentInformation ?? {};

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadRegistrationPdf(form, activeLocale);
    } finally {
      setIsDownloading(false);
    }
  };

  const studentName = isAr
    ? String(info.studentNameAr || info.studentName || "—")
    : String(info.studentNameEn || info.studentName || "—");

  const studentNameSub = isAr
    ? String(info.studentNameEn || "")
    : String(info.studentNameAr || "");

  const studentCode = String(info.studentCode || "—");
  const nationalId = String(info.nationalId || info.nationalIdMasked || "—");
  const academicLevel = localizeAcademicLevel(info.academicLevel, activeLocale);
  const semester = localizeSemester(info.semester, activeLocale);
  const academicYear = String(form.academicYear || info.academicYear || "2026-2027");
  const department = String(
    form.department ||
      info.department ||
      (isAr ? "نظم معلومات الأعمال (BIS)" : "Business Information Systems (BIS)"),
  );
  const gpa =
    typeof info.gpa === "number" ? info.gpa.toFixed(2) : String(info.gpa ?? "—");
  const advisorName = String(
    info.advisorName ||
      info.approvedBy ||
      (isAr ? "د. المرشد الأكاديمي" : "Academic Advisor"),
  );
  const approvedAt = String(
    info.approvedAt || form.date || new Date().toISOString().slice(0, 10),
  );

  const detailsCards = [
    {
      label: copy.fields.studentName,
      sub: copy.fields.studentNameSub,
      value: studentName,
      extraSub: studentNameSub,
      isMono: false,
    },
    {
      label: copy.fields.studentCode,
      sub: copy.fields.studentCodeSub,
      value: studentCode,
      isMono: true,
    },
    {
      label: copy.fields.nationalId,
      sub: copy.fields.nationalIdSub,
      value: nationalId,
      isMono: true,
    },
    {
      label: copy.fields.academicLevel,
      sub: copy.fields.academicLevelSub,
      value: academicLevel,
      isMono: false,
    },
    {
      label: copy.fields.semester,
      sub: copy.fields.semesterSub,
      value: `${semester} (${academicYear})`,
      isMono: false,
    },
    {
      label: copy.fields.department,
      sub: copy.fields.departmentSub,
      value: department,
      isMono: false,
    },
    {
      label: copy.fields.gpa,
      sub: copy.fields.gpaSub,
      value: `${gpa} / 4.00`,
      isMono: true,
    },
    {
      label: copy.fields.advisorName,
      sub: copy.fields.advisorNameSub,
      value: advisorName,
      isMono: false,
    },
  ];

  const serialCode = `REG-${studentCode !== "—" ? studentCode : "STD"}-${approvedAt.replaceAll("-", "")}`;

  return (
    <div className="space-y-6 font-sans" dir={copy.dir}>
      {/* Top Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border">
        {/* Language Switcher Segmented Control */}
        <div className="flex items-center gap-1.5 p-1 rounded-squircle bg-muted/60 border border-border">
          <button
            type="button"
            onClick={() => setActiveLocale("ar")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-squircle transition-all cursor-pointer ${
              activeLocale === "ar"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>العربية (AR)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveLocale("en")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-squircle transition-all cursor-pointer ${
              activeLocale === "en"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>English (EN)</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            onClick={() => openRegistrationPrintView(form, "print", activeLocale)}
            className="flex items-center gap-2 h-9 px-4 text-xs font-semibold rounded-squircle bg-primary hover:bg-primary/90 text-primary-foreground transition-all cursor-pointer shadow-sm"
          >
            <Printer className="h-3.5 w-3.5" />
            {copy.printBtn}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isDownloading}
            onClick={handleDownload}
            className="flex items-center gap-2 h-9 px-4 text-xs font-semibold rounded-squircle border-primary/40 text-primary hover:bg-primary/10 transition-all cursor-pointer shadow-sm"
          >
            {isDownloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {isDownloading ? copy.generatingPdf : copy.downloadBtn}
          </Button>
        </div>
      </div>

      {/* A4 Structured Sheet Display Container */}
      <div className="relative max-w-3xl mx-auto p-6 md:p-8 bg-card border border-border rounded-2xl shadow-xl space-y-6 text-foreground overflow-hidden">
        {/* Top Accent Gradient Stripe */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-teal-700 via-teal-500 to-sky-600" />

        {/* Official Header */}
        <div className="flex flex-col sm:flex-row justify-between items-center pb-4 border-b-2 border-primary/30 gap-4 text-center sm:text-start pt-1">
          <Image
            src="/logo.webp"
            alt="Institute logo"
            width={64}
            height={64}
            unoptimized
            className="w-16 h-16 object-contain rounded-md shrink-0"
          />
          <div className="flex-1 px-3 text-center">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-primary">
              {copy.ministry}
            </p>
            <h2 className="text-lg md:text-xl font-extrabold tracking-tight mt-1 text-foreground">
              {form.titleAr && isAr
                ? form.titleAr
                : form.titleEn && !isAr
                  ? form.titleEn
                  : copy.title}
            </h2>
            <p className="text-xs text-muted-foreground font-semibold mt-0.5">
              {copy.subtitle} · {academicYear}
            </p>
          </div>
          <div className="shrink-0 border border-primary/40 p-2.5 rounded-xl bg-primary/5 text-center">
            <span className="block text-[10px] font-extrabold uppercase text-primary">
              {copy.badgeOfficial}
            </span>
            <span className="block text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {serialCode}
            </span>
          </div>
        </div>

        {/* Student Metadata Factsheet Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {detailsCards.map((item, idx) => (
            <div
              key={idx}
              className="p-3 border border-border rounded-xl bg-muted/20 flex flex-col justify-center"
            >
              <div className="flex justify-between items-baseline gap-2 mb-1">
                <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">
                  {item.label}
                </span>
                <span className="text-[9px] font-semibold text-muted-foreground/70">
                  {item.sub}
                </span>
              </div>
              <strong
                className={`text-xs md:text-sm font-extrabold text-foreground ${
                  item.isMono ? "font-mono ltr:text-left rtl:text-right" : ""
                }`}
                dir={item.isMono ? "ltr" : undefined}
              >
                {item.value}
              </strong>
              {item.extraSub && (
                <span className="text-[9px] text-muted-foreground mt-0.5">
                  {item.extraSub}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Course Registration Table */}
        <div className="overflow-x-auto border border-border rounded-xl shadow-inner">
          <table className="w-full border-collapse text-start text-xs">
            <thead>
              <tr className="bg-gradient-to-r from-teal-600 via-teal-500 to-sky-600 text-white font-bold border-b border-teal-800 rounded-t-lg">
                <th className="p-2.5 text-center w-10">#</th>
                <th className="p-2.5 text-center w-24">{copy.table.code}</th>
                <th className={`p-2.5 ${isAr ? "text-right" : "text-left"}`}>
                  {copy.table.course}
                </th>
                <th className="p-2.5 text-center w-20">{copy.table.credits}</th>
                <th className="p-2.5 text-center w-24">{copy.table.type}</th>
                <th className="p-2.5 text-center w-28">{copy.table.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {form.registeredCourses.map((course, index) => {
                const primaryName = isAr
                  ? course.courseNameAr || course.courseName
                  : course.courseNameEn || course.courseName;
                const secondaryName = isAr ? course.courseNameEn : course.courseNameAr;

                return (
                  <tr
                    key={course.code}
                    className="hover:bg-muted/30 transition-colors even:bg-muted/10"
                  >
                    <td className="p-2.5 text-center text-muted-foreground font-mono">
                      {index + 1}
                    </td>
                    <td className="p-2.5 text-center font-mono font-bold text-foreground">
                      {course.code}
                    </td>
                    <td className={`p-2.5 ${isAr ? "text-right" : "text-left"}`}>
                      <div className="font-bold text-foreground text-xs md:text-sm">
                        {primaryName}
                      </div>
                      {secondaryName && secondaryName !== primaryName && (
                        <div className="text-[10px] text-muted-foreground font-medium mt-0.5">
                          {secondaryName}
                        </div>
                      )}
                    </td>
                    <td className="p-2.5 text-center font-mono font-bold text-foreground">
                      {course.creditHours}
                    </td>
                    <td className="p-2.5 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-squircle text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
                        {localizeCourseType(course.type, activeLocale)}
                      </span>
                    </td>
                    <td className="p-2.5 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-squircle text-[10px] font-extrabold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        {localizeRegistrationStatus(course.status, activeLocale)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Registration Summary Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl text-center shadow-sm">
            <span className="block text-[10px] font-extrabold text-primary uppercase">
              {copy.summary.totalCourses}
            </span>
            <strong className="text-base font-extrabold text-foreground mt-0.5 block font-mono">
              {form.registeredCourses.length} {copy.summary.coursesUnit}
            </strong>
          </div>
          <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl text-center shadow-sm">
            <span className="block text-[10px] font-extrabold text-primary uppercase">
              {copy.summary.totalCredits}
            </span>
            <strong className="text-base font-extrabold text-foreground mt-0.5 block font-mono">
              {form.totalCreditHours} {copy.summary.creditsUnit}
            </strong>
          </div>
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center shadow-sm">
            <span className="block text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase">
              {copy.summary.registrationStatus}
            </span>
            <strong className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 block">
              {localizeRegistrationStatus(form.registrationStatus, activeLocale)}
            </strong>
          </div>
        </div>

        {/* Advisor Notes Endorsement */}
        <div className="p-3.5 border border-dashed border-border rounded-xl bg-muted/15 text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground block font-bold mb-1 text-xs">
            {copy.advisorNotesHeading}
          </strong>
          <p>{form.advisorNotes || copy.advisorNotesDefault}</p>
        </div>

        {/* Signatures & Institute Seal Box */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 text-center text-xs text-muted-foreground border-t border-border">
          <div className="border-t-2 border-foreground/30 pt-2 flex flex-col justify-between min-h-[50px]">
            <div className="font-extrabold text-foreground">{copy.signatures.studentTitle}</div>
            <div className="text-[10px] text-muted-foreground">{copy.signatures.studentSub}</div>
          </div>
          <div className="border-t-2 border-foreground/30 pt-2 flex flex-col justify-between min-h-[50px]">
            <div className="font-extrabold text-foreground">{copy.signatures.advisorTitle}</div>
            <div className="text-[10px] text-muted-foreground">{copy.signatures.advisorSub}</div>
          </div>
          <div className="flex flex-col items-center justify-center">
            <div className="w-18 h-18 rounded-full border-2 border-dashed border-primary/60 flex flex-col items-center justify-center text-[9px] font-extrabold text-primary p-2 bg-primary/5 leading-tight">
              <ShieldCheck className="w-4 h-4 mb-0.5 text-primary" />
              <span>{isAr ? "ختم المعهد الرسمي" : "Official Stamp"}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="flex flex-col sm:flex-row justify-between items-center gap-2 text-center sm:text-start text-[10px] text-muted-foreground pt-4 border-t border-border font-medium">
          <div className="max-w-md">{copy.footerNotice}</div>
          <div className="font-mono text-primary font-bold">{serialCode}</div>
        </footer>
      </div>
    </div>
  );
}
