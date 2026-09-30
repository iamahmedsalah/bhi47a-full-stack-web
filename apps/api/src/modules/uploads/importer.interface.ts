/** Result of a single row validation. */
export interface ImportRowError {
  row: number;
  message: string;
}

/** Aggregated result from a complete import. */
export interface ImportResult {
  successCount: number;
  errors: string[];
}

/**
 * Contract for a type-specific bulk importer.
 *
 * Each upload type (students, courses, grades, etc.) implements this
 * interface so the upload pipeline can treat them uniformly.
 */
export interface Importer {
  /** Unique upload type key, e.g. 'students', 'courses'. */
  readonly type: string;

  /**
   * Validate required fields and return only rows that are valid.
   * Invalid rows are reported back as error strings.
   */
  validate(rows: Record<string, unknown>[]): {
    validRows: { row: Record<string, unknown>; rowNum: number }[];
    errors: string[];
  };

  /**
   * Persist the validated rows into the database.
   * Must use `bulkWrite` or equivalent batched operations.
   */
  commit(
    validRows: { row: Record<string, unknown>; rowNum: number }[],
    actorId: string,
  ): Promise<ImportResult>;
}

/**
 * Registry key used for DI. Each importer is tagged with this token
 * so the pipeline can collect all importers automatically.
 */
export const IMPORTER_TOKEN = 'IMPORTER';
