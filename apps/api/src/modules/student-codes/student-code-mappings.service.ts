import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Types, type ClientSession } from 'mongoose';
import {
  admissionYearPrefix,
  formatStudentCode,
  parseStudentCode,
} from '@student-portal/shared';
import { StudentCodeStore } from './student-code-store.service';
import { AdmissionTransactions } from './admission-transactions.service';
import { codeConflict } from './student-codes.service';
import type { CorrectCodeMappingsDto } from './dto/student-code.dto';

/** Correct future allocation only. Account codes and registry ownership never change. */
@Injectable()
export class StudentCodeMappingsService {
  constructor(
    private readonly store: StudentCodeStore,
    private readonly transactions: AdmissionTransactions,
  ) {}
  async preview(session?: ClientSession) {
    const policies = await this.store.years
      .find({})
      .sort({ academicYear: 1 })
      .limit(101)
      .session(session ?? null)
      .lean();
    let truncated = policies.length > 100;
    const items: Array<{
      academicYear: string;
      currentPrefix: string;
      expectedPrefix: string;
      nextSequence: number;
      nextCode?: string;
    }> = [];
    const evidence: unknown[] = [];
    const expected = new Set<string>();
    let collision = false;
    for (const policy of policies.slice(0, 100)) {
      const prefix = admissionYearPrefix(policy.academicYear);
      if (expected.has(prefix)) collision = true;
      expected.add(prefix);
      evidence.push([
        String(policy._id),
        policy.academicYear,
        policy.yearPrefix,
        policy.allocationPrefix,
        policy.nextSequence,
        policy.revision,
      ]);
      const currentPrefix = policy.allocationPrefix ?? policy.yearPrefix;
      if (currentPrefix === prefix) continue;
      const regex = new RegExp(`^${prefix}[0-9]{4}$`);
      // Bound every source and include numeric login aliases when finding the high-water mark.
      const users = await this.store.users
        .find({
          $or: [
            { studentCode: regex },
            { username: regex },
            { userCode: new RegExp(`^STD-${prefix}[0-9]{4}$`) },
          ],
        })
        .select('_id studentCode username userCode')
        .limit(10001)
        .session(session ?? null)
        .lean();
      const profiles = await this.store.profiles
        .find({ studentCode: regex })
        .select('_id studentCode')
        .limit(10001)
        .session(session ?? null)
        .lean();
      const entries = await this.store.entries
        .find({
          $or: [{ yearPrefix: prefix }, { academicYear: policy.academicYear }],
        })
        .select('_id studentCode academicYear sequence status')
        .limit(10001)
        .session(session ?? null)
        .lean();
      if ([users, profiles, entries].some((rows) => rows.length === 10001))
        truncated = true;
      const observed = [
        ...users.flatMap((user) => [
          user.studentCode,
          user.username,
          user.userCode?.replace(/^STD-/, ''),
        ]),
        ...profiles.map((profile) => profile.studentCode),
        ...entries.map((entry) => entry.studentCode),
      ];
      const nextSequence = Math.max(
        policy.nextSequence,
        1 +
          Math.max(
            0,
            ...entries
              .filter((entry) => entry.academicYear === policy.academicYear)
              .map((entry) => entry.sequence),
          ),
        1 +
          Math.max(
            0,
            ...observed.map((code) =>
              code ? (parseStudentCode(code, prefix) ?? 0) : 0,
            ),
          ),
      );
      items.push({
        academicYear: policy.academicYear,
        currentPrefix,
        expectedPrefix: prefix,
        nextSequence,
        nextCode:
          nextSequence <= 9999
            ? formatStudentCode(prefix, nextSequence)
            : undefined,
      });
      evidence.push(
        users
          .map((user) => [
            String(user._id),
            user.studentCode,
            user.username,
            user.userCode,
          ])
          .sort(),
        profiles
          .map((profile) => [String(profile._id), profile.studentCode])
          .sort(),
        entries
          .map((entry) => [
            String(entry._id),
            entry.studentCode,
            entry.academicYear,
            entry.sequence,
            entry.status,
          ])
          .sort(),
      );
    }
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(evidence))
      .digest('hex');
    return {
      items,
      fingerprint,
      truncated,
      collision,
      canApply: items.length > 0 && !truncated && !collision,
      changesExistingStudentCodes: false as const,
    };
  }
  async correct(dto: CorrectCodeMappingsDto, actorId: string) {
    return this.transactions.run(
      async (session) => {
        const preview = await this.preview(session);
        if (preview.fingerprint !== dto.fingerprint)
          codeConflict(
            'CODE_PREVIEW_CHANGED',
            'The mapping preview changed. Preview again before confirming.',
          );
        if (!preview.canApply)
          codeConflict(
            'CODE_MAPPING_REVIEW_REQUIRED',
            'No safe mapping correction is available for this preview.',
          );
        for (const item of preview.items) {
          await this.store.years.updateOne(
            { academicYear: item.academicYear },
            {
              $set: {
                allocationPrefix: item.expectedPrefix,
                nextSequence: item.nextSequence,
              },
              $inc: { revision: 1 },
            },
            { session },
          );
          await this.store.audits.create(
            [
              {
                studentCode: `${item.expectedPrefix}0000`,
                academicYear: item.academicYear,
                actorId: new Types.ObjectId(actorId),
                action: 'MAPPING_CORRECTED',
                from: item.currentPrefix,
                to: item.expectedPrefix,
                reason: dto.reason,
                at: new Date(),
              },
            ],
            { session },
          );
        }
        return {
          corrected: preview.items.length,
          changesExistingStudentCodes: false,
        };
      },
      () => this.store.prepareWrites(),
    );
  }
}
