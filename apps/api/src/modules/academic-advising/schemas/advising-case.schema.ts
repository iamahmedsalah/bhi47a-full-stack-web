import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  ADVISING_STATUSES,
  type AdvisingStatus,
} from '../constants/advising.constants';
export type AdvisingCaseDocument = HydratedDocument<AdvisingCase>;
@Schema({ collection: 'advising_cases', timestamps: true })
export class AdvisingCase {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User' })
  assignedAdvisorId?: Types.ObjectId;
  @Prop({ required: true, trim: true }) academicYear!: string;
  @Prop({ required: true, trim: true }) semester!: string;
  @Prop({ enum: ADVISING_STATUSES, default: 'NOT_STARTED' })
  status!: AdvisingStatus;
  @Prop({ type: Types.ObjectId, ref: 'AdvisingPlan' })
  currentDraftId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'AdvisingPlan' })
  approvedPlanId?: Types.ObjectId;
  @Prop() generatedAt?: Date;
  @Prop() reviewedAt?: Date;
  @Prop() approvedAt?: Date;
  @Prop() studentAcknowledgedAt?: Date;
  @Prop({
    type: [
      {
        status: { type: String, enum: ADVISING_STATUSES },
        changedAt: Date,
        actorId: { type: Types.ObjectId, ref: 'User' },
      },
    ],
    default: [],
  })
  timeline!: Array<{
    status: AdvisingStatus;
    changedAt: Date;
    actorId: Types.ObjectId;
  }>;
}
export const AdvisingCaseSchema = SchemaFactory.createForClass(AdvisingCase);
AdvisingCaseSchema.index(
  { studentId: 1, academicYear: 1, semester: 1 },
  { unique: true },
);
AdvisingCaseSchema.index({ assignedAdvisorId: 1, status: 1 });
