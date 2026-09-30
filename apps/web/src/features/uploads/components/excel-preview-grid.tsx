'use client';

import React, { useState, useMemo } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Search,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { PreFlightResult, UploadCatalogType } from '../types';
import { UPLOAD_CATALOGS } from '../upload-catalog';

interface ExcelPreviewGridProps {
  preview: PreFlightResult;
  type: UploadCatalogType;
  isAr?: boolean;
}

export function ExcelPreviewGrid({
  preview,
  type,
  isAr = true,
}: ExcelPreviewGridProps) {
  const catalog = UPLOAD_CATALOGS[type];
  const [filterQuery, setFilterQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'grid' | 'issues'>('grid');

  // Filter issues based on search
  const filteredIssues = useMemo(() => {
    if (!filterQuery.trim()) return preview.issues;
    const q = filterQuery.trim().toLowerCase();
    return preview.issues.filter(
      (iss) =>
        iss.message.toLowerCase().includes(q) ||
        iss.fieldLabel.toLowerCase().includes(q) ||
        String(iss.rowNumber).includes(q),
    );
  }, [preview.issues, filterQuery]);

  // Catalog columns to display in grid
  const displayColumns = useMemo(() => {
    if (!catalog) return [];
    return catalog.fields.slice(0, 7); // Show top 7 fields in preview table for clean layout
  }, [catalog]);

  const matchPercentage = useMemo(() => {
    if (!catalog || catalog.fields.length === 0) return 100;
    const requiredTotal = catalog.fields.filter((f) => f.required).length;
    if (requiredTotal === 0) return 100;
    const matchedCount = preview.matchedColumns.length;
    return Math.min(100, Math.round((matchedCount / requiredTotal) * 100));
  }, [catalog, preview.matchedColumns]);

  return (
    <div className="space-y-4 w-full text-start">
      {/* 1. Summary KPI Stat Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* Total Rows */}
        <div className="p-3 rounded-xl border border-border/70 bg-card/60 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">
              {isAr ? 'إجمالي الصفوف' : 'Total Rows'}
            </p>
            <p className="text-base font-bold text-foreground">{preview.totalRows}</p>
          </div>
        </div>

        {/* Valid Rows */}
        <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">
              {isAr ? 'صفوف صالحة' : 'Valid Rows'}
            </p>
            <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">
              {preview.validRows}
            </p>
          </div>
        </div>

        {/* Issue Rows */}
        <div
          className={cn(
            'p-3 rounded-xl border flex items-center gap-3',
            preview.invalidRows > 0
              ? 'border-rose-500/30 bg-rose-500/5'
              : 'border-border/70 bg-card/60',
          )}
        >
          <div
            className={cn(
              'p-2 rounded-lg shrink-0',
              preview.invalidRows > 0
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {preview.invalidRows > 0 ? (
              <XCircle className="w-5 h-5" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">
              {isAr ? 'صفوف بها أخطاء' : 'Rows with Errors'}
            </p>
            <p
              className={cn(
                'text-base font-bold',
                preview.invalidRows > 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-foreground',
              )}
            >
              {preview.invalidRows}
            </p>
          </div>
        </div>

        {/* Column Matching */}
        <div className="p-3 rounded-xl border border-border/70 bg-card/60 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">
              {isAr ? 'تطابق الأعمدة' : 'Column Match'}
            </p>
            <p className="text-base font-bold text-foreground">
              {preview.matchedColumns.length} / {catalog?.fields.filter((f) => f.required).length ?? 0}
            </p>
          </div>
        </div>
      </div>

      {/* 2. Missing Required Columns Alert */}
      {preview.missingRequiredColumns.length > 0 && (
        <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">
              {isAr
                ? 'تنبيه: ملف الإكسيل يفتقد أعمدة أساسية مطلوبة لإتمام الاستيراد:'
                : 'Warning: Uploaded workbook is missing required column headers:'}
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {preview.missingRequiredColumns.map((col, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-md font-mono text-[11px] bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 font-semibold"
                >
                  {col}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. Navigation Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 border-t border-border/70">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('grid')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
              activeTab === 'grid'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {isAr ? 'معاينة السجلات' : 'Data Preview'} ({preview.previewRows.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('issues')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5',
              activeTab === 'issues'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {isAr ? 'الملاحظات والأخطاء' : 'Issues & Errors'}
            {preview.issues.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 font-mono">
                {preview.issues.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'issues' && (
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder={isAr ? 'بحث في الأخطاء...' : 'Filter issues...'}
              className="w-full text-xs ps-8 pe-3 py-1.5 rounded-lg border border-border/70 bg-background text-foreground focus:outline-hidden focus:ring-1 focus:ring-teal-500"
            />
          </div>
        )}
      </div>

      {/* 4. Tab A: Issues List View */}
      {activeTab === 'issues' && (
        <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
          {filteredIssues.length === 0 ? (
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-center text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isAr
                  ? 'رائع! لم يتم العثور على أي أخطاء في ملف البيانات.'
                  : 'Excellent! No validation issues detected.'}
              </span>
            </div>
          ) : (
            filteredIssues.map((issue, idx) => (
              <div
                key={idx}
                className={cn(
                  'p-2.5 rounded-xl border text-xs flex items-start gap-2.5 transition-colors',
                  issue.severity === 'error'
                    ? 'border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300'
                    : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300',
                )}
              >
                {issue.severity === 'error' ? (
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded-md font-mono text-[10px] bg-foreground/10 text-foreground font-bold">
                      {isAr ? `صف ${issue.rowNumber}` : `Row ${issue.rowNumber}`}
                    </span>
                    <span className="font-semibold text-foreground">{issue.fieldLabel}:</span>
                    <span>{issue.message}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 5. Tab B: Tabular Data Grid Preview */}
      {activeTab === 'grid' && (
        <div className="border border-border/70 rounded-xl overflow-hidden bg-card">
          <div className="max-h-64 overflow-x-auto overflow-y-auto">
            <table className="w-full text-xs text-start border-collapse">
              <thead className="bg-muted/70 sticky top-0 z-10 border-b border-border/70 text-muted-foreground font-semibold">
                <tr>
                  <th className="py-2.5 px-3 text-center w-12 font-mono">#</th>
                  <th className="py-2.5 px-3 text-center w-16">
                    {isAr ? 'الحالة' : 'Status'}
                  </th>
                  {displayColumns.map((col) => (
                    <th key={col.key} className="py-2.5 px-3 text-start whitespace-nowrap">
                      {isAr ? col.labelAr : col.labelEn}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {preview.previewRows.map((row) => (
                  <tr
                    key={row.rowNumber}
                    className={cn(
                      'transition-colors hover:bg-muted/30',
                      !row.isValid && 'bg-rose-500/5',
                    )}
                  >
                    {/* Row Index */}
                    <td className="py-2 px-3 text-center font-mono text-[11px] text-muted-foreground">
                      {row.rowNumber}
                    </td>

                    {/* Status Badge */}
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      {row.isValid ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" />
                          {isAr ? 'صالح' : 'Valid'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400">
                          <XCircle className="w-3 h-3" />
                          {isAr ? 'خطأ' : 'Error'}
                        </span>
                      )}
                    </td>

                    {/* Data Cells */}
                    {displayColumns.map((col) => {
                      const val = row.data[col.key];
                      const cellIssue = row.issues.find((iss) => iss.field === col.key);
                      const isError = cellIssue?.severity === 'error';

                      return (
                        <td
                          key={col.key}
                          className={cn(
                            'py-2 px-3 whitespace-nowrap text-foreground',
                            isError && 'bg-rose-500/15 font-semibold text-rose-600 dark:text-rose-300',
                          )}
                          title={cellIssue?.message}
                        >
                          {val !== undefined && val !== null && String(val).trim() !== '' ? (
                            <span
                              className={cn(
                                (col.key === 'studentCode' ||
                                  col.key === 'nationalId' ||
                                  col.key === 'courseCode') &&
                                  'font-mono',
                              )}
                            >
                              {String(val)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 italic">
                              {isAr ? 'فارغ' : 'empty'}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-2 border-t border-border/70 bg-muted/30 text-[11px] text-muted-foreground text-center">
            {isAr
              ? `يتم عرض أول ${preview.previewRows.length} سجل من إجمالي ${preview.totalRows} صف في الملف.`
              : `Displaying first ${preview.previewRows.length} rows out of ${preview.totalRows} records.`}
          </div>
        </div>
      )}
    </div>
  );
}
