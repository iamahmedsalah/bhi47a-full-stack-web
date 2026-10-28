import { readSheet } from 'read-excel-file/browser';

/** Excel exports from the legacy system are sometimes HTML tables named .xls.
 * Parse the detached document as data; never insert its markup into the UI. */
export function enrollmentHtmlRows(buffer: ArrayBuffer): Record<string, unknown>[] | null {
  const signature = new TextDecoder().decode(buffer.slice(0, 4096));
  if (!/^\s*(?:<!doctype\s+html|<html\b|<table\b)/i.test(signature)) return null;
  const charset = signature.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] ?? 'utf-8';
  const encoding = /^(utf-8|utf8|windows-1256|windows-1252|iso-8859-6)$/i.test(charset) ? charset : 'utf-8';
  const doc = new DOMParser().parseFromString(new TextDecoder(encoding).decode(buffer), 'text/html');
  const codeHeaders = new Set(['studentcode', 'code', 'كودالطالب', 'الكودالأكاديمي', 'الكودالاكاديمي', 'الكود', 'كود']);
  for (const table of doc.querySelectorAll('table')) {
    const rows = Array.from(table.rows).map((row) => Array.from(row.cells, (cell) => cell.textContent?.replace(/\u00a0/g, ' ').trim() ?? ''));
    const headerIndex = rows.findIndex((row) => row.some((cell) => codeHeaders.has(cell.toLowerCase().replace(/[\s_-]/g, ''))));
    if (headerIndex < 0) continue;
    const headers = rows[headerIndex];
    return rows.slice(headerIndex + 1).filter((row) => row.some(Boolean)).map((row) => Object.fromEntries(headers.flatMap((header, index) => header ? [[header, row[index] ?? '']] : [])));
  }
  throw new Error('لم يُعثر على عمود كود الطالب في الملف / Student code column was not found in the file');
}

export async function readEnrollmentSheet(file: File): Promise<Record<string, unknown>[]> {
  if (/\.csv$/i.test(file.name)) return []; // Existing server CSV parser.
  if (/\.xls$/i.test(file.name)) {
    const htmlRows = enrollmentHtmlRows(await file.arrayBuffer());
    if (htmlRows) return htmlRows;
  }
  try {
    const sheet = await readSheet(file);
    const headers = sheet[0]?.map((cell) => String(cell ?? '').trim()) ?? [];
    return sheet.slice(1).filter((row) => row.some((cell) => cell !== null && String(cell).trim() !== '')).map((row) => Object.fromEntries(headers.flatMap((header, column) => header ? [[header, row[column] ?? '']] : [])));
  } catch { return []; } // Server validates unsupported or damaged workbooks.
}
