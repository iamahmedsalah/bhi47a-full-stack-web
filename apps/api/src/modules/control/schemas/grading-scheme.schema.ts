import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  CONTROL_COMPONENT_KEYS,
  SEMESTER_VALUES,
  type ControlComponentKey,
  type Semester,
} from '@student-portal/shared';

export type GradingSchemeDocument = GradingScheme & Document;

@Schema({ _id: false })
export class GradingSchemeComponent {
  @Prop({ type: String, required: true, enum: CONTROL_COMPONENT_KEYS })
  key!: ControlComponentKey;

  @Prop({ required: true })
  nameAr!: string;

  @Prop({ required: true })
  nameEn!: string;

  @Prop({ required: true, min: 0 })
  max!: number;

  @Prop({ required: true, min: 0.01 })
  step!: number;

  @Prop({ required: true, default: false })
  enabled!: boolean;
}
const GradingSchemeComponentSchema = SchemaFactory.createForClass(
  GradingSchemeComponent,
);

/** Admin-controlled maximum marks for one course in one term. */
@Schema({ collection: 'control_grading_schemes', timestamps: true })
export class GradingScheme {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  academicYear!: string;

  @Prop({ type: String, required: true, enum: SEMESTER_VALUES })
  semester!: Semester;

  @Prop({ required: true, default: 1, min: 1 })
  version!: number;

  @Prop({ type: [GradingSchemeComponentSchema], default: [] })
  components!: GradingSchemeComponent[];

  /** Set when the first mark is entered; max/step then need an explicit override. */
  @Prop({ type: Date })
  frozenAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;
}

export const GradingSchemeSchema = SchemaFactory.createForClass(GradingScheme);

GradingSchemeSchema.index(
  { courseId: 1, academicYear: 1, semester: 1 },
  { unique: true },
);
