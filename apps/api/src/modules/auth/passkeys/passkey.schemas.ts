import { Schema } from 'mongoose';

export interface PasskeySettings {
  _id: string;
  studentLoginEnabled: boolean;
}

export const PasskeySettingsSchema = new Schema<PasskeySettings>(
  {
    _id: { type: String, required: true },
    studentLoginEnabled: { type: Boolean, default: true, required: true },
  },
  { collection: 'passkey_settings', timestamps: true },
);

export interface PasskeyCredential {
  credentialId: string;
  userId: string;
  userHandle: string;
  publicKey: Buffer;
  counter: number;
  revision: number;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
  name: string;
  createdAt: Date;
  lastUsedAt?: Date;
}

export const PasskeyCredentialSchema = new Schema<PasskeyCredential>(
  {
    credentialId: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    userHandle: { type: String, required: true },
    publicKey: { type: Buffer, required: true, select: false },
    counter: { type: Number, required: true },
    revision: { type: Number, default: 0 },
    transports: { type: [String], default: [] },
    deviceType: { type: String, required: true },
    backedUp: { type: Boolean, required: true },
    name: { type: String, required: true, maxlength: 80 },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: Date,
  },
  { collection: 'passkey_credentials' },
);

export interface PasskeyFlow {
  flowId: string;
  kind: 'register' | 'login' | 'reauth';
  binding: string;
  userId?: string;
  challenge?: string;
  origin: string;
  operation?: string;
  loginArea?: 'student' | 'management' | 'any';
  expiresAt: Date;
}

export const PasskeyFlowSchema = new Schema<PasskeyFlow>(
  {
    flowId: { type: String, required: true, unique: true },
    kind: { type: String, required: true },
    binding: { type: String, required: true },
    userId: String,
    challenge: { type: String, select: false },
    origin: { type: String, required: true },
    operation: String,
    loginArea: { type: String, enum: ['student', 'management', 'any'] },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'passkey_flows' },
);
PasskeyFlowSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
PasskeyFlowSchema.index({ kind: 1, userId: 1, binding: 1, expiresAt: 1 });
