import { BadRequestException } from '@nestjs/common';
import {
  Types,
  type ClientSession,
  type Connection,
  type mongo,
} from 'mongoose';
import type { MinistryEvidenceDto } from './dto/admission-workflow.dto';

export interface AdmissionDecisionDocument {
  _id: Types.ObjectId;
  requestId: Types.ObjectId;
  actorId: Types.ObjectId;
  bytes: Buffer | mongo.Binary;
  uploadedAt: Date;
  expiresAt?: Date;
  attachedAt?: Date;
}

export function admissionDocuments(
  connection: Connection,
): mongo.Collection<AdmissionDecisionDocument> {
  return connection.db!.collection<AdmissionDecisionDocument>(
    'admission_decision_documents',
  );
}

export function cairoToday(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Cairo' }).format(
    new Date(),
  );
}

export function validateEnrollmentDate(
  effectiveDate: string,
  decisionDate?: string,
) {
  if (
    effectiveDate > cairoToday() ||
    (decisionDate && effectiveDate < decisionDate)
  )
    throw new BadRequestException(
      'Use an effective date on or after the decision date and no later than today.',
    );
}

export async function attachMinistryEvidence(
  connection: Connection,
  requestId: Types.ObjectId,
  actorId: Types.ObjectId,
  evidence: MinistryEvidenceDto | undefined,
  session: ClientSession,
) {
  if (!evidence || evidence.decisionDate > cairoToday())
    throw new BadRequestException(
      'Provide a decision reference, date and supporting PDF.',
    );
  const now = new Date();
  const attached = await admissionDocuments(connection).updateOne(
    {
      _id: new Types.ObjectId(evidence.documentId),
      requestId,
      actorId,
      expiresAt: { $gt: now },
    },
    { $set: { attachedAt: now }, $unset: { expiresAt: 1 } },
    { session },
  );
  if (!attached.modifiedCount)
    throw new BadRequestException(
      'The uploaded decision document is missing or has already been used.',
    );
  return { ...evidence };
}
