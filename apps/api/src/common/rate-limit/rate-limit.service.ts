import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { NextFunction, Request, Response } from 'express';
import { AppLoggerService } from '../../core/logger/logger.service';
import { MemoryRateLimiterStore } from './memory-rate-limiter.store';
import { MongoRateLimiterStore } from './mongo-rate-limiter.store';
import { findRateLimitRule, getClientIp } from './rate-limit.rules';
import type {
  RateLimitHit,
  RateLimitRule,
  RateLimiterStore,
} from './rate-limit.types';

const MESSAGES: Record<string, { ar: string; en: string }> = {
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

@Injectable()
export class RateLimiterService {
  private readonly store: RateLimiterStore;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLoggerService,
    @Optional() @InjectConnection() private readonly connection?: Connection,
  ) {
    const storeType = this.configService.get<string>(
      'RATE_LIMIT_STORE',
      'mongo',
    );
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
    const rule = findRateLimitRule(req);
    if (!rule) {
      next();
      return;
    }

    const lang = (req.headers['accept-language'] || 'ar')
      .toString()
      .startsWith('en')
      ? 'en'
      : 'ar';

    try {
      const identity = rule.keyGenerator?.(req) || getClientIp(req);
      const key = `${rule.name}:${identity}`;
      const hit = await this.store.increment(key, rule.windowMs, rule.max);

      this.setRateLimitHeaders(res, rule, hit);

      if (hit.count > rule.max) {
        const ruleMessage = MESSAGES[rule.name]?.[lang] || rule.message;
        res.setHeader('Retry-After', String(hit.retryAfterSeconds));
        res.status(429).json({
          success: false,
          statusCode: 429,
          message: ruleMessage,
          code: 'RATE_LIMIT_EXCEEDED',
          reason: ruleMessage,
          timestamp: new Date().toISOString(),
          path: req.originalUrl,
        });
        return;
      }

      next();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Rate limiter error';
      this.logger.warn(`Rate limiter error: ${message}`, 'RateLimiterService');
      const unavailableMessage = MESSAGES['unavailable'][lang];
      res.status(503).json({
        success: false,
        statusCode: 503,
        message: unavailableMessage,
        code: 'RATE_LIMIT_UNAVAILABLE',
        reason: message,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
      });
    }
  }
}
