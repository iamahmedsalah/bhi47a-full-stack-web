import {
  HttpException,
  Injectable,
  Optional,
  UnauthorizedException,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { NextFunction, Request, Response } from 'express';
import { AppLoggerService } from '../../core/logger/logger.service';
import { MemoryRateLimiterStore } from './memory-rate-limiter.store';
import { MongoRateLimiterStore } from './mongo-rate-limiter.store';
import { findRateLimitRules, getClientIp } from './rate-limit.rules';
import { createHash } from 'node:crypto';
import type { AuthenticatedRequest } from '../../modules/auth/types/authenticated-request';
import type {
  RateLimitHit,
  RateLimitRule,
  RateLimiterStore,
} from './rate-limit.types';

const MESSAGES: Record<string, { ar: string; en: string }> = {
  'auth-ip': {
    en: 'Too many authentication requests. Please retry shortly.',
    ar: 'طلبات تسجيل دخول كثيرة من هذه الشبكة. يرجى الانتظار قليلاً.',
  },
  'google-nonce': {
    en: 'Too many Google sign-in preparations. Please retry shortly.',
    ar: 'طلبات تجهيز تسجيل الدخول بجوجل كثيرة. يرجى الانتظار قليلاً.',
  },
  'quiz-draft': {
    en: 'Too many quiz saves. Please wait a moment.',
    ar: 'طلبات حفظ الاختبار كثيرة. يرجى الانتظار قليلاً.',
  },
  'student-login': {
    en: 'Too many student login attempts. Please try again later.',
    ar: 'محاولات تسجيل دخول متكررة للطالب. يرجى المحاولة مرة أخرى لاحقاً.',
  },
  'admin-login': {
    en: 'Too many admin login attempts. Please try again later.',
    ar: 'محاولات تسجيل دخول متكررة للمدير. يرجى المحاولة مرة أخرى لاحقاً.',
  },
  'change-password': {
    en: 'Too many password change attempts. Please try again later.',
    ar: 'محاولات تغيير كلمة المرور متكررة جداً. يرجى المحاولة مرة أخرى لاحقاً.',
  },
  'student-complaint-create': {
    en: 'You have reached the daily complaint limit. Please try again tomorrow.',
    ar: 'لقد وصلت إلى الحد اليومي لتقديم الشكاوى. يرجى المحاولة مرة أخرى غداً.',
  },
  'student-complaint-reply': {
    en: 'You have reached the daily complaint reply limit. Please try again tomorrow.',
    ar: 'لقد وصلت إلى الحد اليومي للرد على الشكاوى. يرجى المحاولة مرة أخرى غداً.',
  },
  'public-complaint-create': {
    en: 'You have reached the daily complaint limit. Please try again tomorrow.',
    ar: 'لقد وصلت إلى الحد اليومي لتقديم الشكاوى. يرجى المحاولة مرة أخرى غداً.',
  },
  'faq-chat': {
    en: 'Too many chat requests. Please try again later.',
    ar: 'طلبات محادثة متكررة جداً. يرجى المحاولة مرة أخرى لاحقاً.',
  },
  'admin-uploads': {
    en: 'Too many upload requests. Please try again later.',
    ar: 'طلبات تحميل ملفات متكررة جداً. يرجى المحاولة مرة أخرى لاحقاً.',
  },
  'admin-messaging': {
    en: 'Too many messaging requests. Please try again later.',
    ar: 'طلبات إرسال رسائل متكررة جداً. يرجى المحاولة مرة أخرى لاحقاً.',
  },
  'forgot-password': {
    en: 'Too many password recovery attempts. Please try again later.',
    ar: 'محاولات استعادة كلمة المرور متكررة جداً. يرجى المحاولة مرة أخرى لاحقاً.',
  },
  'reset-password-otp': {
    en: 'Too many OTP verification attempts. Please wait 15 minutes.',
    ar: 'محاولات تأكيد رمز التحقق متكررة جداً. يرجى الانتظار 15 دقيقة.',
  },
  'google-verify-otp': {
    en: 'Too many Google OTP attempts. Please try again later.',
    ar: 'محاولات تأكيد رمز جوجل متكررة جداً. يرجى المحاولة لاحقاً.',
  },
  'student-ai-chat': {
    en: 'Too many AI chat messages. Please wait a moment.',
    ar: 'طلبات محادثة الذكاء الاصطناعي متكررة جداً. يرجى الانتظار قليلاً.',
  },
  'admin-exports': {
    en: 'Too many data export requests. Please wait a moment.',
    ar: 'طلبات تصدير البيانات متكررة جداً. يرجى الانتظار قليلاً.',
  },
  'quiz-submit': {
    en: 'Too many quiz submissions. Please wait a moment.',
    ar: 'محاولات تسليم الاختبار متكررة جداً. يرجى الانتظار قليلاً.',
  },
  unavailable: {
    en: 'Rate limiting is temporarily unavailable. Please retry later.',
    ar: 'خدمة تحديد معدل الطلبات غير متاحة مؤقتاً. يرجى المحاولة مرة أخرى لاحقاً.',
  },
};

import { MetricsService } from '../../core/metrics/metrics.service';

@Injectable()
export class RateLimiterService implements OnModuleInit {
  private readonly store: RateLimiterStore;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLoggerService,
    @Optional() @InjectConnection() private readonly connection?: Connection,
    @Optional() private readonly metricsService?: MetricsService,
  ) {
    const storeType = this.configService.get<string>(
      'RATE_LIMIT_STORE',
      'mongo',
    );
    if (
      this.configService.get<string>('NODE_ENV') === 'production' &&
      storeType !== 'mongo'
    ) {
      throw new Error(
        'Production authentication requires shared Mongo rate limiting',
      );
    }
    if (storeType === 'memory') {
      this.store = new MemoryRateLimiterStore();
      this.logger.log(
        'Rate limiter initialized with Memory store',
        'RateLimiterService',
      );
    } else {
      this.store = new MongoRateLimiterStore(this.connection);
      this.logger.log(
        'Rate limiter initialized with Mongo store',
        'RateLimiterService',
      );
    }
  }

  getStore(): RateLimiterStore {
    return this.store;
  }

  async onModuleInit(): Promise<void> {
    if (this.store instanceof MongoRateLimiterStore)
      await this.store.initialize();
  }

  setRateLimitHeaders(
    res: Response,
    rule: RateLimitRule,
    hit: RateLimitHit,
  ): void {
    res.setHeader('RateLimit-Limit', String(rule.max));
    res.setHeader('RateLimit-Remaining', String(hit.remaining));
    res.setHeader('RateLimit-Reset', String(hit.retryAfterSeconds));
  }

  async apply(req: Request, res: Response, next: NextFunction): Promise<void> {
    const rules = findRateLimitRules(req).filter((rule) => !rule.scope);
    try {
      await this.enforceRules(req, res, rules);
      next();
    } catch (error) {
      if (!(error instanceof HttpException)) throw error;
      res.status(error.getStatus()).json(error.getResponse());
    }
  }

  async enforceAuthenticated(
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> {
    const rules = findRateLimitRules(req).filter(
      (rule) => rule.scope === 'authenticated',
    );
    if (!rules.length) return;
    // Called only after JwtAuthGuard verifies the session and loads the user.
    // Never use a body/header identifier or an unverified decoded JWT here.
    if (!req.user?._id) throw new UnauthorizedException();
    await this.enforceRules(req, res, rules, String(req.user._id));
  }

  private async enforceRules(
    req: Request,
    res: Response,
    rules: RateLimitRule[],
    userId?: string,
  ): Promise<void> {
    if (!rules.length) {
      return;
    }

    const lang = (req.headers['accept-language'] || 'ar')
      .toString()
      .startsWith('en')
      ? 'en'
      : 'ar';

    try {
      for (const rule of rules) {
        const identity = userId || rule.keyGenerator?.(req) || getClientIp(req);
        // New windows/scopes must not inherit the old 15-minute IP buckets.
        const key = `${rule.name}:v2:${createHash('sha256').update(identity).digest('hex')}`;
        const hit = await this.store.increment(key, rule.windowMs, rule.max);

        this.setRateLimitHeaders(res, rule, hit);

        if (hit.count > rule.max) {
          this.metricsService?.recordRateLimitBlock(rule.name);
          const ruleMessage = MESSAGES[rule.name]?.[lang] || rule.message;
          res.setHeader('Retry-After', String(hit.retryAfterSeconds));
          throw new HttpException(
            {
              success: false,
              statusCode: 429,
              message: ruleMessage,
              code: 'RATE_LIMIT_EXCEEDED',
              retryAfterSeconds: hit.retryAfterSeconds,
              reason: ruleMessage,
              timestamp: new Date().toISOString(),
              path: req.originalUrl,
            },
            429,
          );
        }
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn('Rate limiter unavailable', 'RateLimiterService');
      const unavailableMessage = MESSAGES['unavailable'][lang];
      throw new HttpException(
        {
          success: false,
          statusCode: 503,
          message: unavailableMessage,
          code: 'RATE_LIMIT_UNAVAILABLE',
          reason: unavailableMessage,
          timestamp: new Date().toISOString(),
          path: req.originalUrl,
        },
        503,
      );
    }
  }
}
