import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomBytes } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { PERMISSIONS, type AdmissionImportRow } from '@student-portal/shared';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import {
  AdmissionWorkflowService,
  admissionId,
  assertAdmissionPermission,
} from './admission-workflow.service';
import {
  AdmissionListDto,
  ApproveApplicantDto,
  DecisionDto,
  UpdateApplicantDto,
} from './dto/admission-workflow.dto';
import { admissionHash } from './admission-security.service';

const HEADERS = [
  'RequestId',
  'Revision',
  'Action',
  'StudentCode',
  'FullName',
  'FullNameAr',
  'Address',
  'Phone',
  'GuardiansJSON',
  'StudentType',
  'PreviousInstitution',
  'PreviousFaculty',
  'TransferNotes',
  'Level',
  'Semester',
  'Department',
  'GroupId',
  'PassedCourses',
  'ReasonCode',
  'Reason',
];
const MAX_ROWS = 500;
export interface AdmissionWorkbookFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}
export const safeAdmissionCell = (value: unknown) =>
  typeof value === 'string' && /^[=+\-@\t\r\n]/.test(value)
    ? `'${value}`
    : value;
/** Bound ZIP expansion before handing the workbook to ExcelJS. No ZIP64/macros. */
export function validateAdmissionWorkbook(buffer: Buffer) {
  if (
    buffer.length < 22 ||
    buffer.length > 5 * 1024 * 1024 ||
    buffer.readUInt32LE(0) !== 0x04034b50
  )
    throw new BadRequestException('Upload an XLSX workbook of at most 5 MB.');
  let end = buffer.length - 22;
  while (
    end >= Math.max(0, buffer.length - 65557) &&
    buffer.readUInt32LE(end) !== 0x06054b50
  )
    end--;
  if (end < Math.max(0, buffer.length - 65557))
    throw new BadRequestException('Invalid workbook archive.');
  const count = buffer.readUInt16LE(end + 10),
    offset = buffer.readUInt32LE(end + 16);
  if (count > 200 || count === 0xffff)
    throw new BadRequestException('Workbook archive is too complex.');
  let cursor = offset,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50)
      throw new BadRequestException('Invalid workbook archive.');
    total += buffer.readUInt32LE(cursor + 24);
    const length = buffer.readUInt16LE(cursor + 28),
      extra = buffer.readUInt16LE(cursor + 30),
      comment = buffer.readUInt16LE(cursor + 32);
    const name = buffer.subarray(cursor + 46, cursor + 46 + length).toString();
    if (
      total > 20 * 1024 * 1024 ||
      /vbaProject|externalLinks|\.bin$/i.test(name)
    )
      throw new BadRequestException(
        'Workbook contains unsupported or oversized content.',
      );
    const local = buffer.readUInt32LE(cursor + 42),
      compressed = buffer.readUInt32LE(cursor + 20),
      method = buffer.readUInt16LE(cursor + 10);
    if (local + 30 > offset || buffer.readUInt32LE(local) !== 0x04034b50)
      throw new BadRequestException('Invalid workbook entry.');
    const start =
      local +
      30 +
      buffer.readUInt16LE(local + 26) +
      buffer.readUInt16LE(local + 28);
    if (start + compressed > offset)
      throw new BadRequestException('Invalid workbook entry bounds.');
    try {
      const content =
        method === 8
          ? inflateRawSync(buffer.subarray(start, start + compressed), {
              maxOutputLength: 20 * 1024 * 1024,
            })
          : method === 0
            ? buffer.subarray(start, start + compressed)
            : undefined;
      if (!content || content.length !== buffer.readUInt32LE(cursor + 24))
        throw new Error();
    } catch {
      throw new BadRequestException(
        'Workbook expansion exceeds safe limits or is invalid.',
      );
    }
    cursor += 46 + length + extra + comment;
  }
}
@Injectable()
export class AdmissionSpreadsheets {
  constructor(private readonly workflow: AdmissionWorkflowService) {}
  async workbook(query: AdmissionListDto, template = false) {
    const workbook = new ExcelJS.Workbook(),
      sheet = workbook.addWorksheet('Requests');
    sheet.addRow(HEADERS);
    if (!template) {
      const filter = this.workflow.filter(query);
      if ((await this.workflow.requests.countDocuments(filter)) > MAX_ROWS)
        throw new BadRequestException(
          'Narrow the filters to at most 500 requests before exporting.',
        );
      for (const item of await this.workflow.requests
        .find(filter)
        .sort({ submittedAt: -1, _id: -1 })
        .limit(MAX_ROWS)
        .lean()) {
        sheet.addRow(
          [
            String(item._id),
            item.revision,
            'KEEP',
            item.studentCode ?? '',
            item.fullName,
            item.fullNameAr ?? '',
            item.address,
            item.phone,
            JSON.stringify(item.guardians),
            item.studentType,
            item.previousInstitution ?? '',
            item.previousFaculty ?? '',
            item.transferNotes ?? '',
            item.level ?? '1',
            item.semester ?? '1',
            item.department ?? 'GENERAL',
            String(item.groupId ?? ''),
            item.passedCourses.join(','),
            '',
            '',
          ].map(safeAdmissionCell),
        );
      }
    }
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: 'T1' };
    sheet.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0D9488' },
      };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { horizontal: 'center' };
    });
    sheet.columns.forEach((column) => {
      let width = 12;
      column.eachCell?.({ includeEmpty: false }, (cell) => {
        width = Math.max(width, Math.min(50, cell.text.length + 2));
      });
      column.width = width;
      column.numFmt = '@';
    });
    const instructions = workbook.addWorksheet('Instructions');
    for (const line of [
      'Match rows by RequestId and Revision. Never change these fields or StudentCode.',
      'Action: KEEP, UPDATE, APPROVE, REJECT, WAITLIST, PENDING or CANCEL. Blank means KEEP.',
      'UPDATE replaces applicant details. GuardiansJSON is an array of name, phone and relationship objects.',
      'APPROVE needs Level 1â€“4, Semester 1â€“2, Department, optional GroupId and comma-separated PassedCourses.',
      'NEW applicants start at level 1 with no passed courses. TRANSFER needs PreviousInstitution.',
      'Levels 1 and 2 use GENERAL. Phone: 010/011/012/015 plus 8 digits; keep as text.',
      'REJECT requires ReasonCode: INELIGIBLE, CAPACITY, INVALID_INFORMATION or OTHER, and a written Reason.',
      'WAITLIST/PENDING/CANCEL require a written Reason. Cancellation keeps the code held for identity safety.',
      'Preview first. Confirmed apply processes valid rows only; each row commits atomically. Reapply returns the same results.',
      'Ù„Ø§ ØªØºÙŠØ± Ù…Ø¹Ø±Ù Ø§Ù„Ø·Ù„Ø¨ Ø£Ùˆ Ø§Ù„Ø¥ØµØ¯Ø§Ø± Ø£Ùˆ ÙƒÙˆØ¯ Ø§Ù„Ø·Ø§Ù„Ø¨. Ø±Ø§Ø¬Ø¹ Ø§Ù„Ù…Ø¹Ø§ÙŠÙ†Ø© Ø«Ù… Ø£ÙƒØ¯ ØªØ·Ø¨ÙŠÙ‚ Ø§Ù„ØµÙÙˆÙ Ø§Ù„ØµØ§Ù„Ø­Ø© ÙÙ‚Ø·.',
      'Ø§Ù„Ø¥Ù„ØºØ§Ø¡ ÙŠØ­ØªÙØ¸ Ø¨ÙƒÙˆØ¯ Ø§Ù„Ø·Ø§Ù„Ø¨ Ù„Ø­Ù…Ø§ÙŠØ© Ø§Ù„Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ø³Ø§Ø¨Ù‚Ø©. Ù„Ø§ ÙŠØªÙ… Ø¥Ù†Ø´Ø§Ø¡ ÙƒÙˆØ¯ Ù‚Ø¨Ù„ Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø©.',
    ])
      instructions.addRow([line]);
    instructions.getColumn(1).width = 120;
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
  private async input(
    action: string,
    data: Record<string, string>,
    actor: AuthenticatedUser,
  ) {
    const common = { revision: Number(data.Revision), confirmed: true };
    const input =
      action === 'APPROVE'
        ? {
            ...common,
            level: data.Level,
            semester: data.Semester,
            department: data.Department,
            groupId: data.GroupId || undefined,
            passedCourses: data.PassedCourses.split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          }
        : action === 'UPDATE'
          ? {
              revision: common.revision,
              fullName: data.FullName,
              fullNameAr: data.FullNameAr || undefined,
              address: data.Address,
              phone: data.Phone,
              guardians: JSON.parse(data.GuardiansJSON) as unknown,
              studentType: data.StudentType,
              previousInstitution: data.PreviousInstitution || undefined,
              previousFaculty: data.PreviousFaculty || undefined,
              transferNotes: data.TransferNotes || undefined,
            }
          : {
              ...common,
              reason: data.Reason,
              reasonCode: data.ReasonCode || undefined,
              groupId: data.GroupId || undefined,
            };
    const dto =
      action === 'APPROVE'
        ? plainToInstance(ApproveApplicantDto, input)
        : action === 'UPDATE'
          ? plainToInstance(UpdateApplicantDto, input)
          : plainToInstance(DecisionDto, input);
    if (
      (await validate(dto, { whitelist: true, forbidNonWhitelisted: true }))
        .length
    )
      throw new Error('Invalid values for this action.');
    const permission =
      action === 'APPROVE'
        ? PERMISSIONS.ADMISSIONS_REQUESTS_APPROVE
        : action === 'UPDATE'
          ? PERMISSIONS.ADMISSIONS_REQUESTS_UPDATE
          : action === 'REJECT'
            ? PERMISSIONS.ADMISSIONS_REQUESTS_REJECT
            : action === 'CANCEL'
              ? PERMISSIONS.ADMISSIONS_REQUESTS_CANCEL
              : PERMISSIONS.ADMISSIONS_REQUESTS_WAITLIST;
    assertAdmissionPermission(actor, permission);
    if (action === 'APPROVE')
      assertAdmissionPermission(actor, PERMISSIONS.ADMISSIONS_ACADEMIC_MANAGE);
    if (data.GroupId)
      assertAdmissionPermission(actor, PERMISSIONS.ADMISSIONS_GROUPS_MANAGE);
    if (action === 'REJECT' && !data.ReasonCode)
      throw new Error('Select a rejection reason.');
    if (
      action === 'REJECT' &&
      data.ReasonCode === 'OTHER' &&
      !data.Reason?.trim()
    )
      throw new Error('Explain the rejection when selecting Other.');
    return input as Record<string, unknown>;
  }
  async preview(
    file: AdmissionWorkbookFile | undefined,
    actor: AuthenticatedUser,
  ) {
    if (!file || !/\.xlsx$/i.test(file.originalname))
      throw new BadRequestException('Upload an XLSX workbook.');
    validateAdmissionWorkbook(file.buffer);
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(
        file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
      );
    } catch {
      throw new BadRequestException('The workbook could not be read.');
    }
    const sheet = workbook.getWorksheet('Requests');
    if (
      !sheet ||
      sheet.rowCount > MAX_ROWS + 1 ||
      sheet.columnCount !== HEADERS.length
    )
      throw new BadRequestException(
        'Use the Requests template with at most 500 data rows.',
      );
    if (
      HEADERS.some(
        (header, index) => sheet.getRow(1).getCell(index + 1).value !== header,
      )
    )
      throw new BadRequestException(
        'Workbook headers do not match the template.',
      );
    const rows: AdmissionImportRow[] = [],
      seen = new Set<string>();
    for (let n = 2; n <= sheet.rowCount; n++) {
      const row: AdmissionImportRow = { row: n, state: 'INVALID' };
      try {
        const data: Record<string, string> = {};
        HEADERS.forEach((key, index) => {
          const value = sheet.getRow(n).getCell(index + 1).value;
          if (
            value !== null &&
            value !== undefined &&
            typeof value !== 'string' &&
            typeof value !== 'number'
          )
            throw new Error('Formulas and complex cells are not accepted.');
          const text = String(value ?? '');
          if (text.length > 4096) throw new Error('A cell is too long.');
          data[key] =
            text.startsWith("'") && /^[=+\-@\t\r\n]/.test(text.slice(1))
              ? text.slice(1)
              : text;
        });
        if (Object.values(data).every((value) => !value.trim())) continue;
        row.requestId = String(admissionId(data.RequestId));
        if (seen.has(row.requestId))
          throw new Error('A request may appear only once per batch.');
        seen.add(row.requestId);
        row.revision = Number(data.Revision);
        row.action = data.Action.trim().toUpperCase() || 'KEEP';
        if (
          ![
            'KEEP',
            'UPDATE',
            'APPROVE',
            'REJECT',
            'WAITLIST',
            'PENDING',
            'CANCEL',
          ].includes(row.action)
        )
          throw new Error('Unknown action.');
        const item = await this.workflow.requests
          .findById(row.requestId)
          .select('_id revision studentCode status')
          .lean();
        if (!item || item.revision !== row.revision)
          throw new Error('Request missing or revision is stale.');
        if ((item.studentCode ?? '') !== data.StudentCode)
          throw new Error('StudentCode is read-only.');
        if (row.action === 'KEEP') row.state = 'SKIPPED';
        else {
          row.input = await this.input(row.action, data, actor);
          row.state = 'VALID';
        }
      } catch (error) {
        row.error =
          error instanceof Error && !(error instanceof SyntaxError)
            ? error.message.slice(0, 180)
            : 'Invalid row values.';
      }
      rows.push(row);
    }
    return this.workflow.transactions.run(async (session) => {
      const [batch] = await this.workflow.batches.create(
        [
          {
            uploadedBy: admissionId(actor._id),
            fileHash: admissionHash(file.buffer.toString('base64')),
            expiresAt: new Date(Date.now() + 60 * 60_000),
            rows,
          },
        ],
        { session },
      );
      return { ...batch.toObject(), mode: 'valid-rows-only' };
    }, this.workflow.prepare);
  }
  async getBatch(id: string, actor: AuthenticatedUser) {
    const batch = await this.workflow.batches
      .findOne({ _id: admissionId(id), uploadedBy: admissionId(actor._id) })
      .select('-lease -fileHash')
      .lean();
    if (!batch) throw new NotFoundException();
    return { ...batch, mode: 'valid-rows-only' };
  }
  async apply(id: string, actor: AuthenticatedUser) {
    const lease = randomBytes(16).toString('hex');
    const claimed = await this.workflow.batches
      .findOneAndUpdate(
        {
          _id: admissionId(id),
          uploadedBy: admissionId(actor._id),
          expiresAt: { $gt: new Date() },
          $or: [
            { status: 'PREVIEWED' },
            { status: 'APPLYING', leaseUntil: { $lt: new Date() } },
          ],
        },
        {
          $set: {
            status: 'APPLYING',
            lease,
            leaseUntil: new Date(Date.now() + 5 * 60_000),
          },
        },
        { new: true },
      )
      .lean();
    if (!claimed) {
      const current = await this.getBatch(id, actor);
      if (current.status === 'APPLIED') return current;
      throw new ConflictException(
        'The batch expired or is being applied. Retry after its lease expires.',
      );
    }
    for (let i = 0; i < claimed.rows.length; i++) {
      const row = claimed.rows[i];
      if (row.state !== 'VALID' || !row.requestId || !row.input) continue;
      const renewed = await this.workflow.batches.updateOne(
        { _id: claimed._id, lease, status: 'APPLYING' },
        { $set: { leaseUntil: new Date(Date.now() + 5 * 60_000) } },
      );
      if (renewed.matchedCount !== 1)
        throw new ConflictException('Import lease changed.');
      const context = { batchId: claimed._id, rowIndex: i, lease };
      try {
        if (row.action === 'APPROVE')
          await this.workflow.approve(
            row.requestId,
            plainToInstance(ApproveApplicantDto, row.input),
            actor,
            context,
          );
        else if (row.action === 'UPDATE')
          await this.workflow.update(
            row.requestId,
            plainToInstance(UpdateApplicantDto, row.input),
            actor,
            context,
          );
        else {
          const dto = plainToInstance(DecisionDto, row.input);
          const current = await this.workflow.requests
            .findById(row.requestId)
            .select('status')
            .lean();
          if (row.action === 'CANCEL' && current?.status === 'APPROVED')
            await this.workflow.cancelApproved(
              row.requestId,
              dto,
              actor,
              context,
            );
          else
            await this.workflow.decide(
              row.requestId,
              row.action === 'REJECT'
                ? 'REJECTED'
                : row.action === 'WAITLIST'
                  ? 'WAITLISTED'
                  : row.action === 'PENDING'
                    ? 'PENDING'
                    : 'CANCELLED',
              dto,
              actor,
              context,
            );
        }
      } catch {
        await this.workflow.batches.updateOne(
          { _id: claimed._id, lease, [`rows.${i}.state`]: 'VALID' },
          {
            $set: {
              [`rows.${i}.state`]: 'FAILED',
              [`rows.${i}.error`]:
                'Not applied. Check permissions, current revision, academic details and group capacity.',
            },
          },
        );
      }
    }
    await this.workflow.batches.updateOne(
      { _id: claimed._id, lease },
      { $set: { status: 'APPLIED' }, $unset: { lease: 1, leaseUntil: 1 } },
    );
    return this.getBatch(id, actor);
  }
}
