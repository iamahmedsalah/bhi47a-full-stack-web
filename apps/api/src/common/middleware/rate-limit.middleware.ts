import type { NextFunction, Request, Response } from 'express';
import { MemoryRateLimiterStore } from '../rate-limit/memory-rate-limiter.store';
import { MongoRateLimiterStore } from '../rate-limit/mongo-rate-limiter.store';
import { findRateLimitRule, getClientIp } from '../rate-limit/rate-limit.rules';
import type {
  RateLimitHit,
  RateLimitRule,
  RateLimiterStore,
} from '../rate-limit/rate-limit.types';

let activeRateLimiterService:
  | {
      apply: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    }
  | undefined;

export function setGlobalRateLimiterService(service: {
  apply: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}) {
  activeRateLimiterService = service;
}

const fallbackStore: RateLimiterStore =
  process.env.RATE_LIMIT_STORE === 'memory'
    ? new MemoryRateLimiterStore()
    : new MongoRateLimiterStore();

function setRateLimitHeaders(
  res: Response,
  rule: RateLimitRule,
  hit: RateLimitHit,
): void {
  res.setHeader('RateLimit-Limit', String(rule.max));
  res.setHeader('RateLimit-Remaining', String(hit.remaining));
  res.setHeader('RateLimit-Reset', String(hit.retryAfterSeconds));
}

export function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (activeRateLimiterService) {
    void activeRateLimiterService.apply(req, res, next);
    return;
  }

  const rule = findRateLimitRule(req);
  if (!rule) {
    next();
    return;
  }

  void applyRateLimit(req, res, next, rule);
}

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
  unavailable: {
    en: 'Rate limiting is temporarily unavailable. Please retry later.',
    ar: 'خدمة تحديد معدل الطلبات غير متاحة مؤقتاً. يرجى المحاولة مرة أخرى لاحقاً.',
  },
};

async function applyRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
  rule: RateLimitRule,
): Promise<void> {
  const lang = (req.headers['accept-language'] || 'ar')
    .toString()
    .startsWith('en')
    ? 'en'
    : 'ar';

  try {
    const identity = rule.keyGenerator?.(req) || getClientIp(req);
    const key = `${rule.name}:${identity}`;
    const hit = await fallbackStore.increment(key, rule.windowMs, rule.max);

    setRateLimitHeaders(res, rule, hit);

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
