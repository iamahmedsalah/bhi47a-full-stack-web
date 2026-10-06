export type UploadCatalogType =
  | 'students'
  | 'courses'
  | 'grades'
  | 'quizzes'
  | 'attendance'
  | 'academic-emails';

export interface CatalogField {
  key: string;
  labelAr: string;
  labelEn: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'enum';
  note?: string;
  aliases: string[];
}

export interface UploadCatalogConfig {
  id: UploadCatalogType;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  fields: CatalogField[];
  sampleDataAr: Record<string, unknown>[];
  sampleDataEn: Record<string, unknown>[];
}

export interface PreFlightIssue {
  rowNumber: number;
  field: string;
  fieldLabel: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
  rawValue?: unknown;
}

export interface PreFlightRow {
  rowNumber: number;
  data: Record<string, unknown>;
  isValid: boolean;
  issues: PreFlightIssue[];
}

export interface PreFlightResult {
  headers: string[];
  matchedColumns: { expectedKey: string; fileHeader: string }[];
  missingRequiredColumns: string[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  canCommit: boolean;
  issues: PreFlightIssue[];
  previewRows: PreFlightRow[];
  parsedRows?: Record<string, unknown>[];
}

export interface UploadResult {
  success: boolean;
  successCount: number;
  failedCount: number;
  errors: string[];
}
