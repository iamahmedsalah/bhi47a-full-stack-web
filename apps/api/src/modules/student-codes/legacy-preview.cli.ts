import 'reflect-metadata';
import { parseArgs } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import mongoose from 'mongoose';
import { isAdmissionAcademicYear } from '@student-portal/shared';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  StudentProfile,
  StudentProfileSchema,
} from '../students/schemas/student-profile.schema';
import {
  AdmissionPeriod,
  AdmissionPeriodSchema,
} from '../admissions/schemas/admission-period.schema';
import {
  StudentCodeEntry,
  StudentCodeEntrySchema,
  StudentCodeYear,
  StudentCodeYearSchema,
  StudentCodeAuditLog,
  StudentCodeAuditLogSchema,
} from './schemas/student-code.schema';
import { StudentCodeStore } from './student-code-store.service';

export function codePreviewArguments(args: string[]) {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      'academic-year': { type: 'string' },
      prefix: { type: 'string' },
      output: { type: 'string' },
    },
  });
  const academicYear = values['academic-year'];
  const yearPrefix = values.prefix;
  if (
    !academicYear ||
    !yearPrefix ||
    !isAdmissionAcademicYear(academicYear) ||
    !/^\d{2}$/.test(yearPrefix)
  )
    throw new Error(
      'Provide --academic-year YYYY-YYYY and --prefix YY. This command is read-only; --apply is not supported.',
    );
  return {
    academicYear,
    yearPrefix,
    output: resolve(
      values.output ??
        `outputs/registration/student-code-preview-${yearPrefix}.json`,
    ),
  };
}

/** No AppModule, workers, automatic collections/indexes, writes or apply option. */
async function main() {
  const options = codePreviewArguments(process.argv.slice(2));
  const uri = process.env.ADMISSIONS_AUDIT_MONGODB_URI;
  if (!uri)
    throw new Error(
      'Set ADMISSIONS_AUDIT_MONGODB_URI explicitly to an approved read-only database connection.',
    );
  const connection = mongoose.createConnection(uri, {
    autoCreate: false,
    autoIndex: false,
    maxPoolSize: 2,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  });
  try {
    await connection.asPromise();
    const store = new StudentCodeStore(
      connection,
      connection.model(StudentCodeEntry.name, StudentCodeEntrySchema),
      connection.model(StudentCodeYear.name, StudentCodeYearSchema),
      connection.model(StudentCodeAuditLog.name, StudentCodeAuditLogSchema),
      connection.model(User.name, UserSchema),
      connection.model(StudentProfile.name, StudentProfileSchema),
      connection.model(AdmissionPeriod.name, AdmissionPeriodSchema),
    );
    const snapshot = await store.snapshot(
      options.academicYear,
      options.yearPrefix,
    );
    const report = {
      readOnly: true,
      academicYear: options.academicYear,
      yearPrefix: options.yearPrefix,
      scannedAt: new Date().toISOString(),
      fingerprint: snapshot.fingerprint,
      summary: snapshot.summary,
      truncated: snapshot.truncated,
      canInitialize: snapshot.canInitialize,
      mappingConflict: snapshot.mappingConflict,
      reuseEnabled: false,
      items: snapshot.rows,
    };
    await mkdir(dirname(options.output), { recursive: true });
    await writeFile(
      options.output,
      JSON.stringify(report, null, 2) + '\n',
      'utf8',
    );
    console.log(`Read-only preview written to ${options.output}`);
  } finally {
    await connection.close();
  }
}
if (typeof require !== 'undefined' && require.main === module) {
  void main().catch(() => {
    console.error(
      'Read-only student-code preview failed. Check arguments, the explicit read-only connection and output permissions. Database credentials are not printed.',
    );
    process.exitCode = 1;
  });
}
