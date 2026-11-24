import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Schema } from 'mongoose';
import type { Model } from 'mongoose';
import { createHash } from 'node:crypto';
import {
  parseSessionDevice,
  isPublicSessionIp,
  type SessionMetadata,
} from './auth-session-metadata.service';

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
  lastAuthenticatedAt?: Date;
  lastActivityAt?: Date;
  idleExpiresAt?: Date;
  revokedAt?: Date;
  ip?: string;
  userAgent?: string;
  device?: string;
  browser?: string;
  os?: string;
  location?: string;
  networkType?: string;
  metadataVersion?: number;
  country?: string;
  latitude?: number;
  longitude?: number;
  isp?: string;
  locationSource?: string;
}
export const AuthSessionSchema = new Schema<AuthSessionRecord>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    tokenVersion: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
    lastAuthenticatedAt: Date,
    lastActivityAt: Date,
    idleExpiresAt: Date,
    revokedAt: Date,
    ip: String,
    userAgent: String,
    device: String,
    browser: String,
    os: String,
    location: String,
    networkType: String,
    metadataVersion: Number,
    country: String,
    latitude: Number,
    longitude: Number,
    isp: String,
    locationSource: String,
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
  getIdleTimeoutMs(): number {
    const raw = Number(
      this.config.get<string>('SESSION_IDLE_TIMEOUT_MINUTES', '1440'),
    );
    const minutes =
      Number.isFinite(raw) && raw > 0
        ? Math.min(Math.max(raw, 5), 10080)
        : 1440;
    return Math.round(minutes * 60 * 1000);
  }
  private computeIdleExpiresAt(expSeconds: number, fromMs: number): Date {
    const absoluteMs = expSeconds * 1000;
    return new Date(Math.min(absoluteMs, fromMs + this.getIdleTimeoutMs()));
  }
  async register(claims: SessionClaims, metadata?: SessionMetadata) {
    if (
      !claims.sid ||
      !/^[A-Za-z0-9_-]{43}$/.test(claims.sid) ||
      !Number.isSafeInteger(claims.exp)
    )
      throw new UnauthorizedException('Invalid session');
    const now = new Date();
    const idleExpiresAt = this.computeIdleExpiresAt(claims.exp, now.getTime());
    try {
      // The hashed SID is the database idempotency key. Retries never change the
      // original expiry/creation time or remove a revocation tombstone.
      await this.records.updateOne(
        { _id: this.key(claims, '') },
        {
          $setOnInsert: {
            userId: claims.sub,
            tokenVersion: claims.tokenVersion ?? 0,
            expiresAt: new Date(claims.exp * 1000),
            createdAt: now,
            lastActivityAt: now,
            idleExpiresAt,
            ...metadata,
          },
        },
        { upsert: true },
      );
    } catch (error) {
      // Concurrent first upserts can race on MongoDB's unique _id index.
      if ((error as { code?: number }).code !== 11000) throw error;
    }
    await this.assertActive(claims, '');
    // A verified repeat sign-in may reuse the SID. Record its actual time without
    // extending the original expiry, changing ownership or reviving revocations.
    await this.refreshMetadata(claims, metadata, new Date());
  }

  async refreshMetadata(
    claims: SessionClaims,
    metadata?: SessionMetadata,
    authenticatedAt?: Date,
  ) {
    const fields = [
      'ip',
      'userAgent',
      'device',
      'browser',
      'os',
      'location',
      'networkType',
      'country',
      'latitude',
      'longitude',
      'isp',
      'locationSource',
    ] as const;
    const unset = Object.fromEntries(
      fields
        .filter((field) => metadata && metadata[field] === undefined)
        .map((field) => [field, '']),
    );
    const set = {
      ...Object.fromEntries(
        Object.entries(metadata ?? {}).filter(
          ([, value]) => value !== undefined,
        ),
      ),
      ...(authenticatedAt
        ? {
            lastAuthenticatedAt: authenticatedAt,
            lastActivityAt: authenticatedAt,
            idleExpiresAt: this.computeIdleExpiresAt(
              claims.exp,
              authenticatedAt.getTime(),
            ),
          }
        : {}),
    };
    await this.records.updateOne(
      {
        _id: this.key(claims, ''),
        userId: claims.sub,
        revokedAt: null,
        tokenVersion: claims.tokenVersion ?? 0,
        expiresAt: { $gt: new Date() },
      },
      { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    );
  }
  async assertActive(claims: SessionClaims, raw: string) {
    const nowDate = new Date();
    const now = Math.floor(nowDate.getTime() / 1000);
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
      const filter = {
        _id: this.key(claims, raw),
        userId: claims.sub,
        tokenVersion: claims.tokenVersion ?? 0,
        revokedAt: null,
        expiresAt: { $gt: nowDate },
      };
      if (typeof this.records.find === 'function') {
        const rows = await this.records
          .find(filter)
          .select('idleExpiresAt expiresAt lastActivityAt')
          .limit(1)
          .lean();
        const session = rows[0];
        if (!session)
          throw new UnauthorizedException('Session revoked or expired');
        if (session.idleExpiresAt && session.idleExpiresAt <= nowDate) {
          throw new UnauthorizedException({
            code: 'SESSION_IDLE_EXPIRED',
            message: 'Session expired due to inactivity',
          });
        }
      } else if (!(await this.records.exists(filter))) {
        throw new UnauthorizedException('Session revoked or expired');
      }
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
  async touch(claims: SessionClaims, raw: string) {
    if (!claims.sid || !Number.isSafeInteger(claims.exp)) return null;
    const now = new Date();
    const idleTimeoutMs = this.getIdleTimeoutMs();
    const absoluteExpiresAt = new Date(claims.exp * 1000);
    const idleExpiresAt = this.computeIdleExpiresAt(claims.exp, now.getTime());
    await this.records.updateOne(
      {
        _id: this.key(claims, raw),
        userId: claims.sub,
        tokenVersion: claims.tokenVersion ?? 0,
        revokedAt: null,
        expiresAt: { $gt: now },
      },
      { $set: { lastActivityAt: now, idleExpiresAt } },
    );
    return {
      idleExpiresAt: idleExpiresAt.toISOString(),
      absoluteExpiresAt: absoluteExpiresAt.toISOString(),
      idleTimeoutSeconds: Math.floor(idleTimeoutMs / 1000),
    };
  }
  async getSessionTiming(claims: SessionClaims, raw: string) {
    if (!claims.sid || !Number.isSafeInteger(claims.exp)) return null;
    const now = new Date();
    const idleTimeoutMs = this.getIdleTimeoutMs();
    const absoluteExpiresAt = new Date(claims.exp * 1000);
    let idleExpiresAt = this.computeIdleExpiresAt(claims.exp, now.getTime());
    if (typeof this.records.find === 'function') {
      const rows = await this.records
        .find({
          _id: this.key(claims, raw),
          userId: claims.sub,
          tokenVersion: claims.tokenVersion ?? 0,
          revokedAt: null,
          expiresAt: { $gt: now },
        })
        .select('idleExpiresAt expiresAt')
        .limit(1)
        .lean();
      if (rows[0]?.idleExpiresAt) {
        idleExpiresAt = new Date(rows[0].idleExpiresAt);
      }
    }
    return {
      idleExpiresAt: idleExpiresAt.toISOString(),
      absoluteExpiresAt: absoluteExpiresAt.toISOString(),
      idleTimeoutSeconds: Math.floor(idleTimeoutMs / 1000),
    };
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
      .select(
        '_id createdAt lastAuthenticatedAt expiresAt ip userAgent metadataVersion device browser os location networkType country latitude longitude isp locationSource',
      )
      .sort({ lastAuthenticatedAt: -1, createdAt: -1 })
      .limit(100)
      .lean();
    return rows.map((row) => {
      // Old records contain fabricated defaults. Only expose network/location
      // details collected by the new resolver; device hints can come from the UA.
      const trustedMetadata = row.metadataVersion === 1;
      const device = parseSessionDevice(row.userAgent);
      return {
        _id: row._id,
        createdAt: row.createdAt,
        lastAuthenticatedAt: row.lastAuthenticatedAt ?? row.createdAt,
        expiresAt: row.expiresAt,
        current: row._id === currentId,
        ...device,
        ip:
          trustedMetadata && row.ip && isPublicSessionIp(row.ip)
            ? row.ip
            : undefined,
        privateIp: Boolean(
          trustedMetadata && row.ip && !isPublicSessionIp(row.ip),
        ),
        location: trustedMetadata ? row.location : undefined,
        country: trustedMetadata ? row.country : undefined,
        latitude: trustedMetadata ? row.latitude : undefined,
        longitude: trustedMetadata ? row.longitude : undefined,
        isp: trustedMetadata ? row.isp : undefined,
        locationSource: trustedMetadata ? row.locationSource : undefined,
        networkType: trustedMetadata ? row.networkType : undefined,
      };
    });
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
