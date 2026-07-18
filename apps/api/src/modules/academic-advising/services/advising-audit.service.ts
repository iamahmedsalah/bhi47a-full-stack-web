import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AdvisingAuditLog } from '../schemas/advising-audit-log.schema';
@Injectable()
export class AdvisingAuditService {
  constructor(
    @InjectModel(AdvisingAuditLog.name)
    private readonly model: Model<AdvisingAuditLog>,
  ) {}
  record(
    caseId: string | Types.ObjectId,
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
    values?: {
      previousValue?: Record<string, unknown>;
      newValue?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.model.create({
      advisingCaseId: caseId,
      actorId,
      action,
      entityType,
      entityId,
      ...values,
    });
  }
  list(caseId: string) {
    return this.model
      .find({ advisingCaseId: caseId })
      .sort({ createdAt: -1 })
      .lean();
  }
}
