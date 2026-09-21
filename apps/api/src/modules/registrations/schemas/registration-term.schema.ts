import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SEMESTER_VALUES, type Semester } from '@student-portal/shared';

export type RegistrationTermDocument = HydratedDocument<RegistrationTerm>;

@Schema({ collection: 'registration_terms', timestamps: true })
export class RegistrationTerm {
  @Prop({ required: true, trim: true })
  academicYear!: string;

  @Prop({ type: String, required: true, enum: SEMESTER_VALUES })
  semester!: Semester;

  @Prop({ default: false })
  isOpen!: boolean;

  @Prop({ default: false, index: true })
  isCurrent!: boolean;

  @Prop()
  opensAt?: Date;

  @Prop()
  closesAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;
}

export const RegistrationTermSchema =
  SchemaFactory.createForClass(RegistrationTerm);
RegistrationTermSchema.index(
  { academicYear: 1, semester: 1 },
  { unique: true },
);
