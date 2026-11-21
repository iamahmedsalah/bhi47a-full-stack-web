import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'control_editor_checkpoints', timestamps: true })
export class ControlEditorCheckpoint {
  // The built-in unique _id index covers the authenticated user and resolved sheet.
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, default: null })
  studentId!: string | null;

  @Prop({ type: String, required: true })
  field!: string;

  @Prop({ type: String, required: true })
  sort!: string;

  @Prop({ type: Boolean, required: true })
  descending!: boolean;

  @Prop({ type: String, required: true })
  filter!: string;

  @Prop({ type: Boolean, required: true })
  onlyMissing!: boolean;

  @Prop({ type: String, default: '' })
  search!: string;
}

export const ControlEditorCheckpointSchema = SchemaFactory.createForClass(
  ControlEditorCheckpoint,
);
