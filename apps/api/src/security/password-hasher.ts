import {
  Injectable,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

export const BCRYPT_ROUNDS = 12;

export function passwordHashFormat(hash: string): 'bcrypt' | 'unknown' {
  return /^\$2[ab]\$(0[4-9]|1[0-4])\$[./A-Za-z0-9]{53}$/.test(hash)
    ? 'bcrypt'
    : 'unknown';
}

@Injectable()
export class PasswordHasher {
  private readonly logger = new Logger(PasswordHasher.name);
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  // One bounded queue for account passwords, OTPs and passkey password step-up.
  private async bounded<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= 2) {
      if (this.waiters.length >= 32)
        throw new ServiceUnavailableException(
          'Authentication is busy. Please retry shortly.',
        );
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    } else {
      this.active++;
    }
    try {
      return await work();
    } finally {
      const next = this.waiters.shift();
      if (next) next();
      else this.active--;
    }
  }

  async hash(password: string): Promise<string> {
    if (!password || Buffer.byteLength(password, 'utf8') > 4096)
      throw new Error('Invalid password length');
    return this.bounded(() => bcrypt.hash(password, BCRYPT_ROUNDS));
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    if (
      typeof password !== 'string' ||
      typeof encoded !== 'string' ||
      Buffer.byteLength(password, 'utf8') > 4096
    )
      return false;
    if (passwordHashFormat(encoded) !== 'bcrypt') {
      this.logger.warn(JSON.stringify({ event: 'password_hash_unsupported' }));
      return false;
    }
    return this.bounded(async () => {
      try {
        return await bcrypt.compare(password, encoded);
      } catch {
        return false;
      }
    });
  }
}

// Authentication never rehashes or rewrites an existing password.
export const defaultPasswordHasher = new PasswordHasher();
