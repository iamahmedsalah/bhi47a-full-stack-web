import { readSheet as readXlsxFile } from 'read-excel-file/browser';
import type {
  PreFlightIssue,
  PreFlightResult,
  PreFlightRow,
  UploadCatalogType,
} from './types';
import { UPLOAD_CATALOGS, validateCatalogRow } from './upload-catalog';

function toAsciiDigits(str: string): string {
  return str
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function normalizeHeaderKey(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\*/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '');
}

/**
 * Parses XML Spreadsheet 2003 (.xls) text if user uploads legacy XML format
 */
function parseXmlSpreadsheet(
  xmlText: string,
): { headers: string[]; rows: string[][] } | null {
  try {
    if (!xmlText.includes('<Workbook') && !xmlText.includes('<?xml')) {
      return null;
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const parserError = doc.getElementsByTagName('parsererror');
    if (parserError.length > 0) return null;

    const rowElements = Array.from(doc.getElementsByTagName('Row'));
    if (!rowElements.length) return null;

    const parsedRows: string[][] = [];
    for (const rowEl of rowElements) {
      const cellElements = Array.from(rowEl.getElementsByTagName('Cell'));
      const rowData = cellElements.map((c) => {
        const dataEl = c.getElementsByTagName('Data')[0];
        return (dataEl?.textContent ?? c.textContent ?? '').trim();
      });
      if (rowData.some((val) => val.length > 0)) {
        parsedRows.push(rowData);
      }
    }

    if (parsedRows.length === 0) return null;
    return {
      headers: parsedRows[0],
      rows: parsedRows.slice(1),
    };
  } catch {
    return null;
  }
}

/**
 * Parses raw file buffer/content into rows
 */
export async function extractRawSheetRows(
  file: File,
): Promise<{
  headers: string[];
  rawRows: (string | number | boolean | null)[][];
}> {
  const isExcel = /\.(xlsx|xls|xlsb|ods)$/i.test(file.name);
  const buffer = await file.arrayBuffer();
  const firstBytes = new Uint8Array(buffer.slice(0, 4));
  const isZipArchive = firstBytes[0] === 0x50 && firstBytes[1] === 0x4b; // 'PK'

  // 1. Primary: read-excel-file for genuine .xlsx or zip archives
  if (isExcel || isZipArchive) {
    try {
      const sheetData = await readXlsxFile(file);
      if (sheetData && sheetData.length > 0) {
        const headers = sheetData[0].map((cell) =>
          String(cell ?? '')
            .replace(/^\uFEFF/, '')
            .trim(),
        );
        const rawRows = sheetData.slice(1) as (
          | string
          | number
          | boolean
          | null
        )[][];
        return { headers, rawRows };
      }
    } catch {
      // Fallback below if read-excel-file encounters non-standard workbook
    }
  }

  // 2. Secondary: XML Spreadsheet 2003
  const text = new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, '');
  if (
    (text.includes('<Workbook') || text.includes('<?xml')) &&
    !text.startsWith('PK')
  ) {
    const xmlParsed = parseXmlSpreadsheet(text);
    if (xmlParsed) {
      return { headers: xmlParsed.headers, rawRows: xmlParsed.rows };
    }
  }

  // 3. Fallback: CSV / TSV
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 0 && !l.startsWith('<?xml') && !l.startsWith('<Workbook'),
    );

  if (lines.length > 0) {
    const headers = lines[0]
      .split(/[,;\t]/)
      .map((h) => h.trim().replace(/^["']|["']$/g, ''));
    const rawRows = lines
      .slice(1)
      .map((line) =>
        line.split(/[,;\t]/).map((c) => c.trim().replace(/^["']|["']$/g, '')),
      );
    return { headers, rawRows };
  }

  throw new Error('الملف المرفوع فارغ أو لا يحتوي على بيانات صالحة');
}

export interface PreFlightInspectOptions {
  allowDuplicateStudentCode?: boolean;
}

/**
 * Runs pre-flight client-side inspection and validation on uploaded spreadsheet
 */
export async function inspectAndValidateFile(
  file: File,
  type: UploadCatalogType,
  isAr: boolean = true,
  options?: PreFlightInspectOptions,
): Promise<PreFlightResult> {
  const catalog = UPLOAD_CATALOGS[type];
  if (!catalog) {
    throw new Error(`Catalog not found for type: ${type}`);
  }

  const { headers: rawHeaders, rawRows } = await extractRawSheetRows(file);
  const cleanHeaders = rawHeaders.filter((h) => h && h.trim().length > 0);

  if (cleanHeaders.length === 0) {
    throw new Error(
      isAr
        ? 'الملف لا يحتوي على عناوين أعمدة صالحة'
        : 'File has no valid headers',
    );
  }

  // Map file headers to catalog fields
  const matchedColumns: { expectedKey: string; fileHeader: string }[] = [];
  const headerIndexToFieldKey: Map<number, string> = new Map();
  const matchedFieldKeys = new Set<string>();

  // Pass 1: EXACT match against field.key, aliases, labelAr, labelEn
  for (let hIdx = 0; hIdx < rawHeaders.length; hIdx++) {
    const fileHeader = rawHeaders[hIdx];
    if (!fileHeader) continue;
    const norm = normalizeHeaderKey(fileHeader);

    const exactMatch = catalog.fields.find((f) => {
      if (matchedFieldKeys.has(f.key)) return false;
      const fieldNorm = normalizeHeaderKey(f.key);
      const labelArNorm = normalizeHeaderKey(f.labelAr);
      const labelEnNorm = normalizeHeaderKey(f.labelEn);
      const aliasMatch = f.aliases.some((a) => normalizeHeaderKey(a) === norm);
      return (
        norm === fieldNorm ||
        norm === labelArNorm ||
        norm === labelEnNorm ||
        aliasMatch
      );
    });

    if (exactMatch) {
      headerIndexToFieldKey.set(hIdx, exactMatch.key);
      matchedFieldKeys.add(exactMatch.key);
      matchedColumns.push({ expectedKey: exactMatch.key, fileHeader });
    }
  }

  // Pass 2: Fallback prefix match for remaining unmatched columns only
  for (let hIdx = 0; hIdx < rawHeaders.length; hIdx++) {
    if (headerIndexToFieldKey.has(hIdx)) continue;
    const fileHeader = rawHeaders[hIdx];
    if (!fileHeader) continue;
    const norm = normalizeHeaderKey(fileHeader);

    const looseMatch = catalog.fields.find((f) => {
      if (matchedFieldKeys.has(f.key)) return false;
      const fieldNorm = normalizeHeaderKey(f.key);
      const labelArNorm = normalizeHeaderKey(f.labelAr);
      const labelEnNorm = normalizeHeaderKey(f.labelEn);
      if (fieldNorm.length < 4 || norm.length < 4) return false;
      return (
        norm.startsWith(fieldNorm) ||
        fieldNorm.startsWith(norm) ||
        norm.startsWith(labelArNorm) ||
        norm.startsWith(labelEnNorm)
      );
    });

    if (looseMatch) {
      headerIndexToFieldKey.set(hIdx, looseMatch.key);
      matchedFieldKeys.add(looseMatch.key);
      matchedColumns.push({ expectedKey: looseMatch.key, fileHeader });
    }
  }

  // Check required columns
  const missingRequiredColumns: string[] = [];
  for (const field of catalog.fields) {
    if (field.required) {
      const isMatched = matchedColumns.some(
        (mc) => mc.expectedKey === field.key,
      );
      if (!isMatched) {
        missingRequiredColumns.push(isAr ? field.labelAr : field.labelEn);
      }
    }
  }

  // Parse and validate rows
  const allIssues: PreFlightIssue[] = [];
  const previewRows: PreFlightRow[] = [];
  const allParsedRows: Record<string, unknown>[] = [];
  let validRowCount = 0;
  let invalidRowCount = 0;

  // Track duplicates (e.g. studentCode)
  const seenUniqueKeys = new Map<string, number>();

  for (let rIdx = 0; rIdx < rawRows.length; rIdx++) {
    const rowValues = rawRows[rIdx];
    const rowNumber = rIdx + 2; // Row 1 is header in Excel

    // Check if empty row
    const hasAnyValue = rowValues.some(
      (v) => v !== null && v !== undefined && String(v).trim().length > 0,
    );
    if (!hasAnyValue) continue;

    const rowData: Record<string, unknown> = {};
    for (let cIdx = 0; cIdx < rowValues.length; cIdx++) {
      const cellVal = rowValues[cIdx];
      const strVal =
        cellVal !== null && cellVal !== undefined
          ? toAsciiDigits(String(cellVal).trim())
          : '';
      const fieldKey = headerIndexToFieldKey.get(cIdx);
      if (fieldKey) {
        rowData[fieldKey] = strVal;
      } else {
        const rawHeader = rawHeaders[cIdx];
        if (rawHeader && strVal !== '') {
          rowData[rawHeader] = strVal;
        }
      }
    }

    allParsedRows.push(rowData);

    const rowIssues = validateCatalogRow(type, rowNumber, rowData, isAr);

    // Check for duplicate studentCode or unique identifiers within the file
    if (rowData.studentCode) {
      const codeStr = String(rowData.studentCode).trim();
      const courseStr = rowData.courseCode
        ? String(rowData.courseCode).trim().toUpperCase()
        : '';
      const allowDuplicate =
        options?.allowDuplicateStudentCode ??
        (type === 'grades' || type === 'quizzes' || type === 'attendance');

      if (allowDuplicate) {
        if (courseStr) {
          const quizNumStr =
            type === 'quizzes' && rowData.quizNumber !== undefined
              ? `:::${String(rowData.quizNumber).trim()}`
              : '';
          const pairKey = `${codeStr}:::${courseStr}${quizNumStr}`;
          if (seenUniqueKeys.has(pairKey)) {
            const firstSeenRow = seenUniqueKeys.get(pairKey)!;
            rowIssues.push({
              rowNumber,
              field: 'studentCode',
              fieldLabel: isAr ? 'كود الطالب' : 'Student Code',
              code: 'DUPLICATE_STUDENT_COURSE',
              message: isAr
                ? `كود الطالب (${codeStr}) مكرر لنفس المقرر (${courseStr}) (ظهر لأول مرة في صف ${firstSeenRow})`
                : `Student code (${codeStr}) is duplicated for course (${courseStr}) (first seen at row ${firstSeenRow})`,
              severity: 'error',
              rawValue: codeStr,
            });
          } else {
            seenUniqueKeys.set(pairKey, rowNumber);
          }
        }
      } else {
        if (seenUniqueKeys.has(codeStr)) {
          const firstSeenRow = seenUniqueKeys.get(codeStr)!;
          rowIssues.push({
            rowNumber,
            field: 'studentCode',
            fieldLabel: isAr ? 'كود الطالب' : 'Student Code',
            code: 'DUPLICATE_CODE',
            message: isAr
              ? `كود الطالب (${codeStr}) مكرر في الملف (ظهر لأول مرة في صف ${firstSeenRow})`
              : `Student code (${codeStr}) is duplicated (first seen at row ${firstSeenRow})`,
            severity: 'error',
            rawValue: codeStr,
          });
        } else {
          seenUniqueKeys.set(codeStr, rowNumber);
        }
      }
    }

    const isRowValid = !rowIssues.some((issue) => issue.severity === 'error');
    if (isRowValid) {
      validRowCount++;
    } else {
      invalidRowCount++;
    }

    allIssues.push(...rowIssues);

    // Keep up to 30 preview rows for the visual grid
    if (previewRows.length < 30) {
      previewRows.push({
        rowNumber,
        data: rowData,
        isValid: isRowValid,
        issues: rowIssues,
      });
    }
  }

  const totalRows = validRowCount + invalidRowCount;
  const canCommit = totalRows > 0 && missingRequiredColumns.length === 0;

  return {
    headers: cleanHeaders,
    matchedColumns,
    missingRequiredColumns,
    totalRows,
    validRows: validRowCount,
    invalidRows: invalidRowCount,
    canCommit,
    issues: allIssues,
    previewRows,
    parsedRows: allParsedRows,
  };
}
