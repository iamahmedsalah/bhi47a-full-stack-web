import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { GradeChangeDto } from '../dto/control.dto';

export type ControlImportDocument = ControlImport & Document;

@Schema({ collection: 'control_import_batches', timestamps: true })
export class ControlImport {
  @Prop({ type: Types.ObjectId, required: true }) sheetId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) actorId!: Types.ObjectId;
  @Prop({ required: true }) revision!: number;
  @Prop({ required: true }) schemeVersion!: number;
  @Prop({ type: [Object], required: true }) changes!: GradeChangeDto[];
  @Prop({ type: [String], default: [] }) errors!: string[];
  @Prop({ type: Object }) result?: Record<string, unknown>;
  @Prop({ type: Date, required: true }) expiresAt!: Date;
}
export const ControlImportSchema = SchemaFactory.createForClass(ControlImport);
ControlImportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
