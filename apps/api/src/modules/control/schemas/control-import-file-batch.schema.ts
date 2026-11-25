import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ collection: 'control_import_file_batches' })
export class ControlImportFileBatch {
  @Prop({ type: Types.ObjectId, required: true }) sheetId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) actorId!: Types.ObjectId;
  @Prop({ required: true }) schemeVersion!: number;
  @Prop({ type: [Object], required: true }) rows!: Record<string, unknown>[];
  @Prop({ type: Date, required: true }) expiresAt!: Date;
}

export const ControlImportFileBatchSchema = SchemaFactory.createForClass(
  ControlImportFileBatch,
);
ControlImportFileBatchSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
