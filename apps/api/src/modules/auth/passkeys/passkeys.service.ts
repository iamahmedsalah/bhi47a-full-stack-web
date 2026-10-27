import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { UsersService } from '../../users/users.service';
import { AuthSessionService } from '../services/auth-session.service';
import { MetricsService } from '../../../core/metrics/metrics.service';
import { readPasskeyConfig } from './passkeys.config';
import type {
  PasskeyCredential,
  PasskeyFlow,
  PasskeySettings,
} from './passkey.schemas';
import type {
  PasskeyLoginVerifyDto,
  PasskeyRegisterVerifyDto,
} from './passkeys.dto';

const FLOW_TTL = 3 * 60 * 1000;
const REAUTH_TTL = 5 * 60 * 1000;
export const passkeyHash = (value: string) =>
  createHash('sha256').update(value).digest('hex');

// Lean Mongoose reads expose BSON Binary; hydrated/test records expose Buffer.
export function passkeyPublicKeyBytes(value: Buffer | { value(): Uint8Array }) {
  return new Uint8Array(Buffer.isBuffer(value) ? value : value.value());
}

@Injectable()
export class PasskeysService implements OnModuleInit {
  private readonly policy: ReturnType<typeof readPasskeyConfig>;
  private readonly logger = new Logger(PasskeysService.name);

  constructor(
    config: ConfigService,
    @InjectModel('PasskeyCredential')
    private readonly credentials: Model<PasskeyCredential>,
    @InjectModel('PasskeyFlow') private readonly flows: Model<PasskeyFlow>,
    private readonly users: UsersService,
    private readonly sessions: AuthSessionService,
    @InjectModel('PasskeySettings')
    private readonly settings: Model<PasskeySettings>,
    @Optional() private readonly metrics?: MetricsService,
  ) {
    this.policy = readPasskeyConfig(config);
  }

  async onModuleInit() {
    if (this.policy.enabled) {
      // Only new isolated collections; do not sync/drop any existing indexes.
      // Await Mongoose's automatic initialization before explicit index work.
      await this.credentials.init();
      await this.flows.init();
      await this.credentials.createIndexes();
      await this.flows.createIndexes();
    }
  }

  async capabilities() {
    const settings = await this.getSettings();
    return {
      enabled: this.policy.enabled,
      studentLoginEnabled: this.policy.enabled && settings.studentLoginEnabled,
    };
  }

  async getSettings() {
    const settings = await this.settings.findById('global').lean();
    return { studentLoginEnabled: settings?.studentLoginEnabled ?? true };
  }

  async updateSettings(studentLoginEnabled: boolean, actorId: string) {
    await this.settings.updateOne(
      { _id: 'global' },
      { $set: { studentLoginEnabled } },
      { upsert: true, runValidators: true },
    );
    this.logger.log(
      JSON.stringify({
        event: 'student_passkey_login_setting_changed',
        actorId,
        studentLoginEnabled,
      }),
    );
    return { studentLoginEnabled };
  }

  private async assertStudentLoginEnabled() {
    if (!(await this.getSettings()).studentLoginEnabled) {
      throw new ForbiddenException('Student passkey sign-in is disabled');
    }
  }

  assertOrigin(origin?: string): string {
    if (!this.policy.enabled) throw new NotFoundException();
    if (!origin || !this.policy.origins.includes(origin))
      throw new ForbiddenException('Passkey origin is not allowed');
    return origin;
  }

  private sessionBinding(token?: string) {
    if (!token || typeof token !== 'string') throw new UnauthorizedException();
    return passkeyHash(token);
  }

  private async activeUser(userId: string) {
    const user = await this.users.findById(userId);
    if (
      !user.isActive ||
      !['student', 'admin', 'staff'].includes(user.role) ||
      user.mustChangePassword ||
      this.users.isAccountLocked(user)
    ) {
      throw new UnauthorizedException(
        'Use password sign-in or account recovery',
      );
    }
    return user;
  }

  async reauthenticate(
    userId: string,
    token: string,
    password: string,
    origin: string,
    operation: 'register' | 'rename' | 'remove' = 'register',
    credentialId?: string,
  ) {
    this.assertOrigin(origin);
    const purpose =
      operation === 'register'
        ? 'register'
        : `${operation}:${credentialId ?? ''}`;
    if (!/^(register|(rename|remove):[a-f\d]{24})$/i.test(purpose))
      throw new BadRequestException('Invalid passkey operation');
    const user = await this.activeUser(userId);
    // Match student password normalization already used by the existing login.
    const candidate =
      user.role === 'student'
        ? password
            .trim()
            .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
        : password;
    if (!(await this.users.validatePassword(user, candidate))) {
      await this.users.incrementLoginAttempts(userId);
      this.logger.warn(
        JSON.stringify({ event: 'passkey_reauth_failed', userId }),
      );
      throw new ForbiddenException('Password verification failed');
    }
    const binding = this.sessionBinding(token);
    await this.flows.deleteMany({
      kind: 'reauth',
      userId,
      binding,
      operation: purpose,
    });
    await this.flows.create({
      flowId: randomUUID(),
      kind: 'reauth',
      operation: purpose,
      userId,
      binding,
      origin,
      expiresAt: new Date(Date.now() + REAUTH_TTL),
    });
    return { expiresIn: REAUTH_TTL / 1000 };
  }

  private async requireRecent(
    userId: string,
    token: string,
    origin: string,
    operation = 'register',
  ) {
    this.assertOrigin(origin);
    await this.activeUser(userId);
    const binding = this.sessionBinding(token);
    if (
      !(await this.flows
        .findOneAndDelete({
          kind: 'reauth',
          operation,
          userId,
          binding,
          origin,
          expiresAt: { $gt: new Date() },
        })
        .lean())
    ) {
      throw new ForbiddenException({
        code: 'PASSKEY_REAUTH_REQUIRED',
        message: 'Verify your password before managing passkeys',
      });
    }
    return binding;
  }

  userHandle(userId: string) {
    return createHash('sha256')
      .update(`passkey:${this.policy.rpID}:${userId}`)
      .digest();
  }

  async registerOptions(userId: string, token: string, origin: string) {
    const binding = await this.requireRecent(userId, token, origin);
    const existing = await this.credentials.find({ userId }).limit(100).lean();
    if (existing.length >= 20)
      throw new BadRequestException('Maximum number of passkeys reached');
    const options = await generateRegistrationOptions({
      rpName: 'Student Portal',
      rpID: this.policy.rpID,
      userID: new Uint8Array(this.userHandle(userId)),
      userName: this.userHandle(userId).toString('base64url'),
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
      excludeCredentials: existing.map((c) => ({
        id: c.credentialId,
        transports: c.transports,
      })),
    });
    const flowId = randomUUID();
    await this.flows.create({
      flowId,
      kind: 'register',
      binding,
      userId,
      origin,
      challenge: options.challenge,
      expiresAt: new Date(Date.now() + FLOW_TTL),
    });
    return { flowId, options };
  }

  private async consume(
    flowId: string,
    kind: string,
    binding: string,
    origin: string,
    userId?: string,
  ) {
    const flow = await this.flows
      .findOneAndDelete({
        flowId,
        kind,
        binding,
        origin,
        ...(userId ? { userId } : {}),
        expiresAt: { $gt: new Date() },
      })
      .select('+challenge')
      .lean();
    if (!flow?.challenge)
      throw new BadRequestException('Passkey request expired or already used');
    return flow;
  }

  async registerVerify(
    userId: string,
    token: string,
    origin: string,
    dto: PasskeyRegisterVerifyDto,
  ) {
    this.assertOrigin(origin);
    await this.activeUser(userId);
    const binding = this.sessionBinding(token);
    const flow = await this.consume(
      dto.flowId,
      'register',
      binding,
      origin,
      userId,
    );
    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verification = await verifyRegistrationResponse({
        response: dto.response,
        expectedChallenge: flow.challenge!,
        expectedOrigin: origin,
        expectedRPID: this.policy.rpID,
        requireUserVerification: true,
      });
    } catch {
      throw new BadRequestException(
        'Passkey registration could not be verified',
      );
    }
    if (!verification.verified || !verification.registrationInfo)
      throw new BadRequestException(
        'Passkey registration could not be verified',
      );
    const info = verification.registrationInfo;
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Passkey name is required');
    try {
      await this.credentials.create({
        credentialId: info.credential.id,
        userId,
        userHandle: this.userHandle(userId).toString('base64url'),
        publicKey: Buffer.from(info.credential.publicKey),
        counter: info.credential.counter,
        transports: info.credential.transports ?? [],
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        name,
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000)
        throw new ConflictException('Passkey is already registered');
      throw error;
    }
    this.logger.log(JSON.stringify({ event: 'passkey_added', userId }));
    return { ok: true };
  }

  async loginOptions(
    origin: string,
    area: 'student' | 'management' | 'any' = 'any',
  ) {
    this.assertOrigin(origin);
    if (area === 'student') await this.assertStudentLoginEnabled();
    const options = await generateAuthenticationOptions({
      rpID: this.policy.rpID,
      userVerification: 'required',
    });
    const flowId = randomUUID();
    const flowToken = randomBytes(32).toString('base64url');
    await this.flows.create({
      flowId,
      kind: 'login',
      loginArea: area,
      binding: passkeyHash(flowToken),
      origin,
      challenge: options.challenge,
      expiresAt: new Date(Date.now() + FLOW_TTL),
    });
    return { flowId, flowToken, options };
  }

  async loginVerify(
    origin: string,
    flowToken: string | undefined,
    dto: PasskeyLoginVerifyDto,
  ) {
    this.assertOrigin(origin);
    try {
      if (!flowToken || !/^[A-Za-z0-9_-]{43}$/.test(flowToken))
        throw new Error();
      const flow = await this.consume(
        dto.flowId,
        'login',
        passkeyHash(flowToken),
        origin,
      );
      if (typeof dto.response.id !== 'string' || dto.response.id.length > 1024)
        throw new Error();
      const credential = await this.credentials
        .findOne({ credentialId: dto.response.id })
        .select('+publicKey')
        .lean();
      if (!credential) throw new Error();
      const user = await this.activeUser(credential.userId);
      if (user.role === 'student') await this.assertStudentLoginEnabled();
      this.assertLoginArea(user.role, flow.loginArea);
      if (dto.response.response?.userHandle !== credential.userHandle)
        throw new Error();
      const verification = await verifyAuthenticationResponse({
        response: dto.response,
        expectedChallenge: flow.challenge!,
        expectedOrigin: origin,
        expectedRPID: this.policy.rpID,
        requireUserVerification: true,
        credential: {
          id: credential.credentialId,
          publicKey: passkeyPublicKeyBytes(credential.publicKey),
          counter: credential.counter,
          transports: credential.transports,
        },
      });
      if (!verification.verified) throw new Error();
      // Revision also serializes authenticators whose valid counter stays at zero.
      const updated = await this.credentials.updateOne(
        {
          _id: credential._id,
          revision: credential.revision,
          counter: credential.counter,
        },
        {
          $set: {
            counter: verification.authenticationInfo.newCounter,
            backedUp: verification.authenticationInfo.credentialBackedUp,
            lastUsedAt: new Date(),
          },
          $inc: { revision: 1 },
        },
      );
      if (updated.modifiedCount !== 1) throw new Error();
      const current = await this.activeUser(credential.userId);
      if (current.role === 'student') await this.assertStudentLoginEnabled();
      this.assertLoginArea(current.role, flow.loginArea);
      if (current.tokenVersion !== user.tokenVersion) throw new Error();
      const result = await this.sessions.completeCredentialLogin(current);
      this.metrics?.recordLoginAttempt('success');
      this.logger.log(
        JSON.stringify({
          event: 'passkey_login_success',
          userId: credential.userId,
        }),
      );
      return result;
    } catch {
      this.metrics?.recordLoginAttempt('invalid_credentials');
      this.logger.warn(JSON.stringify({ event: 'passkey_login_failed' }));
      throw new UnauthorizedException(
        'Passkey sign-in failed. Try again or use another sign-in method.',
      );
    }
  }

  async list(userId: string) {
    if (!this.policy.enabled) throw new NotFoundException();
    return this.credentials
      .find({ userId })
      .select('name createdAt lastUsedAt deviceType backedUp')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
  }

  private assertLoginArea(
    role: string,
    area?: 'student' | 'management' | 'any',
  ) {
    if (
      (area === 'student' && role !== 'student') ||
      (area === 'management' && !['admin', 'staff'].includes(role))
    ) {
      throw new UnauthorizedException('Account cannot use this sign-in area');
    }
  }

  async rename(
    userId: string,
    token: string,
    origin: string,
    id: string,
    name: string,
  ) {
    await this.requireRecent(userId, token, origin, `rename:${id}`);
    if (!/^[a-f\d]{24}$/i.test(id) || !name.trim())
      throw new BadRequestException('Invalid passkey');
    const result = await this.credentials.updateOne(
      { _id: id, userId },
      { $set: { name: name.trim() } },
    );
    if (!result.matchedCount) throw new NotFoundException('Passkey not found');
    return { ok: true };
  }

  async remove(userId: string, token: string, origin: string, id: string) {
    await this.requireRecent(userId, token, origin, `remove:${id}`);
    // Password reauthentication just proved the mandatory fallback remains usable.
    if (!/^[a-f\d]{24}$/i.test(id))
      throw new BadRequestException('Invalid passkey');
    const result = await this.credentials.deleteOne({ _id: id, userId });
    if (!result.deletedCount) throw new NotFoundException('Passkey not found');
    this.logger.log(JSON.stringify({ event: 'passkey_removed', userId }));
    return { ok: true };
  }
}
