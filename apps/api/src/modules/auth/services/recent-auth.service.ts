import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Schema } from 'mongoose';
import type { Model } from 'mongoose';
import { randomUUID, randomBytes } from 'node:crypto';
import { UsersService } from '../../users/users.service';
import { sessionDigest } from './auth-session-store.service';

export interface AuthAction {
  flowId: string;
  operation: string;
  binding: string;
  userId?: string;
  origin?: string;
  nonce?: string;
  expiresAt: Date;
}
export const AuthActionSchema = new Schema<AuthAction>(
  {
    flowId: { type: String, required: true, unique: true },
    operation: { type: String, required: true },
    binding: { type: String, required: true },
    userId: String,
    origin: String,
    nonce: { type: String, select: false },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'auth_actions' },
);
AuthActionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
AuthActionSchema.index({ userId: 1, binding: 1, operation: 1 });

export function validSensitiveOperation(value: string) {
  return /^(google-link:(start|verify-otp|verify-oauth|remove)|profile:contact|sessions:all|sessions:[a-f0-9]{64}|(student-reset|staff-reset|staff-permissions):[a-f0-9]{24})$/.test(
    value,
  );
}

@Injectable()
export class RecentAuthService {
  constructor(
    @InjectModel('AuthAction') private readonly actions: Model<AuthAction>,
    private readonly users: UsersService,
  ) {}
  async reauthenticate(
    userId: string,
    token: string,
    password: string,
    operation: string,
  ) {
    if (!validSensitiveOperation(operation) || !token)
      throw new ForbiddenException('Invalid sensitive operation');
    const user = await this.users.findById(userId);
    if (
      !user.isActive ||
      user.mustChangePassword ||
      this.users.isAccountLocked(user)
    )
      throw new UnauthorizedException('Account restricted');
    const candidate =
      user.role === 'student'
        ? password
            .trim()
            .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
        : password;
    if (!(await this.users.validatePassword(user, candidate))) {
      await this.users.incrementLoginAttempts(userId);
      throw new ForbiddenException('Password verification failed');
    }
    const binding = sessionDigest(token);
    await this.actions.deleteMany({ userId, binding, operation });
    await this.actions.create({
      flowId: randomUUID(),
      operation,
      userId,
      binding,
      expiresAt: new Date(Date.now() + 5 * 60000),
    });
    return { expiresIn: 300 };
  }
  async require(userId: string, token: string, operation: string) {
    if (!validSensitiveOperation(operation) || !token)
      throw new ForbiddenException('Invalid sensitive operation');
    const grant = await this.actions.findOneAndDelete({
      userId,
      binding: sessionDigest(token),
      operation,
      expiresAt: { $gt: new Date() },
    });
    if (!grant)
      throw new ForbiddenException({
        code: 'AUTH_REAUTH_REQUIRED',
        operation,
        message: 'Verify your current password to continue',
      });
  }
  async googleNonce(origin: string) {
    const flowId = randomUUID();
    const proof = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    await this.actions.create({
      flowId,
      operation: 'google-nonce',
      binding: sessionDigest(proof),
      nonce,
      origin,
      expiresAt: new Date(Date.now() + 5 * 60000),
    });
    return { flowId, proof, nonce };
  }
  async consumeGoogleNonce(
    flowId: string,
    proof: string,
    nonce: string,
    origin: string,
  ) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(proof))
      throw new UnauthorizedException('Invalid Google login flow');
    const flow = await this.actions
      .findOneAndDelete({
        flowId,
        binding: sessionDigest(proof),
        operation: 'google-nonce',
        origin,
        expiresAt: { $gt: new Date() },
      })
      .select('+nonce');
    if (!flow || flow.nonce !== nonce)
      throw new UnauthorizedException(
        'Google login request expired or already used',
      );
  }
}
