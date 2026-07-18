"use client";

import React, { useState } from "react";
import { Printer, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type PrintableRegistrationForm,
  openRegistrationPrintView,
  downloadRegistrationPdf,
  fieldLabels,
  bilingualValue,
} from "@/lib/registration-print";

interface RegistrationSlipViewProps {
  form: PrintableRegistrationForm;
  locale: string;
}

export function RegistrationSlipView({ form, locale }: RegistrationSlipViewProps) {
  const isEnglish = locale === "en";
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadRegistrationPdf(form);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Action Buttons at the Top */}
      <div className="flex justify-end gap-3 pb-4 border-b border-border">
        <Button
          onClick={() => openRegistrationPrintView(form, "print")}
          className="flex items-center gap-2 h-10 text-xs font-semibold bg-primary hover:bg-primary/80 text-primary-foreground transition-all cursor-pointer shadow-md"
        >
          <Printer className="h-4 w-4" />
          {isEnglish ? "Print" : "طباعة الاستمارة"}
        </Button>
        <Button
          variant="outline"
          disabled={isDownloading}
          onClick={handleDownload}
          className="flex items-center gap-2 h-10 text-xs font-semibold border-primary text-primary hover:bg-primary/10 transition-all cursor-pointer shadow-md"
        >
          {isDownloading ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          {isDownloading
            ? (isEnglish ? "Generating PDF..." : "جاري تجهيز PDF...")
            : (isEnglish ? "Download PDF" : "تحميل PDF")}
        </Button>
      </div>

      {/* A4 structured sheet display */}
      <div className="max-w-3xl mx-auto p-6 md:p-8 bg-card border border-border rounded-xl shadow-lg space-y-6 text-foreground text-start">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-center pb-4 border-b-2 border-primary gap-4 text-center sm:text-start">
          <img
            src={`${window.location.origin}/logo.webp`}
            alt="Institute logo"
            className="w-16 h-16 object-contain"
          />
          <div className="flex-1 px-4 text-center">
            <p className="text-xs font-bold text-primary">{form.instituteName}</p>
            <h2 className="text-lg font-extrabold tracking-tight mt-1 text-foreground">{form.title}</h2>
            <p className="text-xs text-muted-foreground font-semibold">استمارة تسجيل المقررات الدراسية</p>
          </div>
          <div className="text-[10px] font-bold text-muted-foreground border border-border p-2 rounded-lg bg-secondary/20 text-center">
            استمارة رسمية<br />REGISTRATION
          </div>
        </div>

        {/* Student Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 border border-border rounded-lg overflow-hidden bg-secondary/5">
          {Object.entries(form.studentInformation)
            .filter(([, value]) => value !== undefined && value !== "")
            .map(([key, value]) => (
              <div
                key={key}
                className="p-3 border-b border-l border-border flex flex-col justify-center"
              >
                <span className="text-[10px] font-bold text-muted-foreground tracking-wider">
                  {fieldLabels[key] || key}
                </span>
                <strong className="text-sm font-semibold text-foreground mt-0.5">
                  {key === "semester" ? bilingualValue(value) : value}
                </strong>
              </div>
            ))}
        </div>

        {/* Course Registration Table */}
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full border-collapse text-start text-xs">
            <thead>
              <tr className="bg-secondary/40 border-b border-border text-foreground font-bold text-start">
                <th className="p-3 text-center w-10">#</th>
                <th className="p-3 text-start w-24">الكود</th>
                <th className="p-3 text-start">المقرر الدراسي</th>
                <th className="p-3 text-center w-20">الساعات</th>
                <th className="p-3 text-start w-24">النوع</th>
                <th className="p-3 text-start w-32">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {form.registeredCourses.map((course, index) => (
                <tr key={course.code} className="hover:bg-secondary/10 transition-colors">
                  <td className="p-3 text-center text-muted-foreground font-mono">{index + 1}</td>
                  <td className="p-3 text-start font-mono font-semibold text-foreground">{course.code}</td>
                  <td className="p-3 text-start font-bold">
                    <div>{course.courseNameAr ?? course.courseName}</div>
                    {course.courseNameEn && (
                      <div className="text-[10px] text-muted-foreground font-normal">{course.courseNameEn}</div>
                    )}
                  </td>
                  <td className="p-3 text-center font-mono font-semibold">{course.creditHours}</td>
                  <td className="p-3 text-start text-muted-foreground">{bilingualValue(course.type)}</td>
                  <td className="p-3 text-start">
                    <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                      {bilingualValue(course.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary Row */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg text-xs font-bold text-foreground">
          <span>إجمالي الساعات المعتمدة: {form.totalCreditHours}</span>
          <span>حالة التسجيل: {bilingualValue(form.registrationStatus)}</span>
        </div>

        {/* Advisor Notes */}
        <div className="p-4 border border-border rounded-lg text-xs bg-secondary/5 text-muted-foreground leading-normal">
          <strong className="text-foreground">ملاحظات المرشد الأكاديمي:</strong>
          <p className="mt-1">{form.advisorNotes || "—"}</p>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-12 pt-6 text-center text-xs text-muted-foreground border-t border-border/60">
          <div className="border-t border-muted-foreground/30 pt-2">توقيع الطالب</div>
          <div className="border-t border-muted-foreground/30 pt-2">توقيع المرشد الأكاديمي</div>
        </div>

        {/* Footer */}
        <footer className="text-center text-[10px] text-muted-foreground pt-4 border-t border-border/40 font-semibold">
          تم الإنشاء في {form.date} · تعتبر هذه الاستمارة صالحة فقط بوجود ختم المعهد الرسمي.
        </footer>
      </div>
    </div>
  );
}
