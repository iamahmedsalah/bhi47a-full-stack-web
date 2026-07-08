import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { ROLE_VALUES, type Role } from '@student-portal/shared';

export type UserDocument = User & Document;

@Schema({
  collection: 'users',
  timestamps: true,
})
export class User {
  @Prop({ required: true, enum: ROLE_VALUES })
  role!: Role;

  @Prop({
    trim: true,
    lowercase: true,
    unique: true,
    sparse: true,
    minlength: 3,
    maxlength: 32,
  })
  username?: string;

  @Prop({ trim: true, minlength: 2, maxlength: 80 })
  firstName?: string;

  @Prop({ trim: true, minlength: 2, maxlength: 80 })
  lastName?: string;

  @Prop({ required: true, trim: true, minlength: 2, maxlength: 160 })
  name!: string;

  @Prop({ trim: true, lowercase: true, unique: true, sparse: true })
  email?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true })
  avatarUrl?: string;

  @Prop({ unique: true, sparse: true })
  googleId?: string;

  @Prop({ unique: true, sparse: true })
  googleEmail?: string;

  @Prop()
  googleLinkedAt?: Date;

  @Prop({ default: false })
  googleLinkPending!: boolean;

  @Prop({ trim: true, unique: true, sparse: true })
  userCode?: string;

  @Prop({ unique: true, sparse: true })
  studentCode?: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ select: false })
  nationalIdHash?: string;

  @Prop()
  nationalIdMasked?: string;

  @Prop()
  nationalId?: string;

  @Prop({ default: false })
  mustChangePassword!: boolean;

  @Prop({ default: 0 })
  tokenVersion!: number;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop()
  deactivatedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  deactivatedBy?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 500 })
  deactivationReason?: string;

  @Prop({ type: [String], default: [] })
  permissions!: string[];

  @Prop({
    type: [
      {
        token: String,
        platform: { type: String, enum: ['web', 'android', 'ios'] },
        lastUsedAt: Date,
      },
    ],
    default: [],
  })
  fcmTokens!: Array<{
    token: string;
    platform: 'web' | 'android' | 'ios';
    lastUsedAt: Date;
  }>;

  @Prop({ default: 0 })
  failedLoginAttempts!: number;

  @Prop()
  lockUntil?: Date;

  @Prop({ default: 0 })
  loginAttempts!: number;

  @Prop()
  lockedUntil?: Date;

  @Prop()
  lastLoginAt?: Date;

  @Prop()
  passwordChangedAt?: Date;

  @Prop({ select: false })
  resetPasswordToken?: string;

  @Prop()
  resetPasswordExpireAt?: Date;

  @Prop({ select: false })
  refreshTokenHash?: string;

  @Prop()
  refreshTokenExpiresAt?: Date;

  @Prop({ type: String, enum: ['light', 'dark', 'system'], default: 'system' })
  theme?: 'light' | 'dark' | 'system';

  // timestamps: true adds createdAt and updatedAt automatically
}

export const UserSchema = SchemaFactory.createForClass(User);

// Indexes
UserSchema.index({ role: 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ userCode: 1 }, { unique: true, sparse: true });
UserSchema.index({ lockUntil: 1 });
UserSchema.index({ deactivatedAt: 1 });

UserSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const sanitized = ret as Partial<
      Record<
        | 'passwordHash'
        | 'nationalIdHash'
        | 'resetPasswordToken'
        | 'refreshTokenHash'
        | '__v',
        unknown
      >
    >;
    delete sanitized.passwordHash;
    delete sanitized.nationalIdHash;
    delete sanitized.resetPasswordToken;
    delete sanitized.refreshTokenHash;
    delete sanitized.__v;
    return ret;
  },
});
