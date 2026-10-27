import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Schema } from 'mongoose';
import type { Model } from 'mongoose';
import { createHash } from 'node:crypto';

export const sessionDigest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export interface SessionClaims {
  sub: string;
  tokenVersion?: number;
  sid?: string;
  iat: number;
  exp: number;
  iss?: string;
  aud?: string;
}
export interface AuthSessionRecord {
  _id: string;
  userId: string;
  tokenVersion: number;
  expiresAt: Date;
  createdAt: Date;
  revokedAt?: Date;
}
export const AuthSessionSchema = new Schema<AuthSessionRecord>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    tokenVersion: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
    revokedAt: Date,
  },
  { collection: 'auth_sessions', versionKey: false },
);
AuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

@Injectable()
export class AuthSessionStore {
  constructor(
    @InjectModel('AuthSession')
    private readonly records: Model<AuthSessionRecord>,
    private readonly config: ConfigService,
  ) {}
  private key(claims: SessionClaims, raw: string) {
    return sessionDigest(claims.sid ?? `legacy:${raw}`);
  }
  async register(claims: SessionClaims) {
    if (
      !claims.sid ||
      !/^[A-Za-z0-9_-]{43}$/.test(claims.sid) ||
      !Number.isSafeInteger(claims.exp)
    )
      throw new UnauthorizedException('Invalid session');
    await this.records.create({
      _id: this.key(claims, ''),
      userId: claims.sub,
      tokenVersion: claims.tokenVersion ?? 0,
      expiresAt: new Date(claims.exp * 1000),
    });
  }
  async assertActive(claims: SessionClaims, raw: string) {
    const now = Math.floor(Date.now() / 1000);
    if (
      !Number.isSafeInteger(claims.iat) ||
      !Number.isSafeInteger(claims.exp) ||
      claims.iat > now + 30 ||
      claims.exp <= now ||
      claims.exp <= claims.iat
    )
      throw new UnauthorizedException('Invalid session time');
    if (claims.sid !== undefined) {
      if (
        typeof claims.sid !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(claims.sid) ||
        claims.iss !==
          this.config.get<string>('JWT_ISSUER', 'student-portal') ||
        claims.aud !==
          this.config.get<string>('JWT_AUDIENCE', 'student-portal-web')
      )
        throw new UnauthorizedException('Invalid session claims');
      if (
        !(await this.records.exists({
          _id: this.key(claims, raw),
          userId: claims.sub,
          tokenVersion: claims.tokenVersion ?? 0,
          revokedAt: null,
          expiresAt: { $gt: new Date() },
        }))
      )
        throw new UnauthorizedException('Session revoked or expired');
    } else {
      const cutoff = Date.parse(
        this.config.get<string>('LEGACY_JWT_ACCEPT_UNTIL', ''),
      );
      if (
        !Number.isFinite(cutoff) ||
        Date.now() >= cutoff ||
        cutoff > Date.now() + 7 * 86400000 ||
        !raw ||
        (await this.records.exists({
          _id: this.key(claims, raw),
          revokedAt: { $ne: null },
        }))
      )
        throw new UnauthorizedException('Please sign in again');
    }
  }
  async revoke(claims: SessionClaims, raw: string) {
    await this.records.updateOne(
      { _id: this.key(claims, raw) },
      {
        $set: { revokedAt: new Date() },
        $setOnInsert: {
          userId: claims.sub,
          tokenVersion: claims.tokenVersion ?? 0,
          expiresAt: new Date(claims.exp * 1000),
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
  }
  async list(userId: string, currentId: string, tokenVersion = 0) {
    const rows = await this.records
      .find({
        userId,
        tokenVersion,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .select('_id createdAt expiresAt')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return rows.map((row) => ({ ...row, current: row._id === currentId }));
  }
  async revokeOwned(userId: string, id: string) {
    if (!/^[a-f0-9]{64}$/.test(id))
      throw new UnauthorizedException('Invalid session');
    const result = await this.records.updateOne(
      { _id: id, userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    if (!result.matchedCount)
      throw new UnauthorizedException('Session not found');
  }
}
