import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Schema as MongooseSchema,
  Types,
  type HydratedDocument,
} from 'mongoose';

@Schema({ _id: false })
class PeriodHistory {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  actorId!: Types.ObjectId;

  @Prop({ required: true })
  at!: Date;

  @Prop({ required: true })
  revision!: number;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  changes!: Record<string, unknown>;
}
const PeriodHistorySchema = SchemaFactory.createForClass(PeriodHistory);

@Schema({ collection: 'admission_periods', timestamps: true })
export class AdmissionPeriod {
  @Prop({ required: true, trim: true, immutable: true })
  code!: string;

  @Prop({ required: true, immutable: true })
  academicYear!: string;

  @Prop({ required: true, trim: true, maxlength: 160 })
  name!: string;

  @Prop({ trim: true, maxlength: 160 })
  nameAr?: string;

  @Prop({ required: true })
  opensAt!: Date;

  @Prop({ required: true })
  closesAt!: Date;

  @Prop({ default: false })
  isEnabled!: boolean;

  @Prop({ default: 0, min: 0 })
  revision!: number;
  @Prop({ default: 0 }) accessRevision!: number;
  @Prop() deletedAt?: Date;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  deletedBy?: Types.ObjectId;

  @Prop({ type: [PeriodHistorySchema], select: false, default: [] })
  history!: PeriodHistory[];

  createdAt?: Date;
  updatedAt?: Date;
}
export type AdmissionPeriodDocument = HydratedDocument<AdmissionPeriod>;
export const AdmissionPeriodSchema =
  SchemaFactory.createForClass(AdmissionPeriod);
AdmissionPeriodSchema.index({ code: 1 }, { unique: true });
AdmissionPeriodSchema.index({ academicYear: 1, createdAt: -1 });
