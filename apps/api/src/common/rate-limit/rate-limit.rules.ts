import type { Request } from 'express';
import type { RateLimitRule } from './rate-limit.types';

const minute = 60 * 1000;
const hour = 60 * minute;
const day = 24 * hour;

function readLimit(envKey: string, fallback: number): number {
  const value = Number.parseInt(process.env[envKey] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getClientIp(req: Request): string {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return forwardedFor || req.ip || req.socket.remoteAddress || 'unknown';
}

function readBodyString(req: Request, key: string): string | undefined {
  const body = req.body as Record<string, unknown> | undefined;
  const value = body?.[key];
  return typeof value === 'string' && value.trim()
    ? value.trim().toLowerCase()
    : undefined;
}

function identityKey(...parts: Array<string | undefined>): string | undefined {
  return parts.find((part) => part && part.length > 0);
}

export const rateLimitRules: RateLimitRule[] = [
  {
    name: 'student-login',
    methods: ['POST'],
    pattern: /^\/api\/auth\/student\/login$/,
    windowMs: 15 * minute,
    max: readLimit('STUDENT_LOGIN_RATE_LIMIT', 8),
    message: 'Too many student login attempts. Please try again later.',
    keyGenerator: (req) =>
      identityKey(readBodyString(req, 'studentCode'), getClientIp(req)),
  },
  {
    name: 'admin-login',
    methods: ['POST'],
    pattern: /^\/api\/auth\/admin\/login$/,
    windowMs: 15 * minute,
    max: readLimit('ADMIN_LOGIN_RATE_LIMIT', 8),
    message: 'Too many admin login attempts. Please try again later.',
    keyGenerator: (req) =>
      identityKey(readBodyString(req, 'email'), getClientIp(req)),
  },
  {
    name: 'change-password',
    methods: ['POST'],
    pattern: /^\/api\/auth\/change-password$/,
    windowMs: 15 * minute,
    max: readLimit('CHANGE_PASSWORD_RATE_LIMIT', 8),
    message: 'Too many password change attempts. Please try again later.',
  },
  {
    name: 'student-complaint-create',
    methods: ['POST'],
    pattern: /^\/api\/students\/complaints$/,
    windowMs: day,
    max: readLimit('STUDENT_COMPLAINT_DAILY_RATE_LIMIT', 3),
    message:
      'You have reached the daily complaint limit. Please try again tomorrow.',
  },
  {
    name: 'student-complaint-reply',
    methods: ['POST'],
    pattern: /^\/api\/students\/complaints\/[^/]+\/reply$/,
    windowMs: day,
    max: readLimit('STUDENT_COMPLAINT_REPLY_DAILY_RATE_LIMIT', 3),
    message:
      'You have reached the daily complaint reply limit. Please try again tomorrow.',
  },
  {
    name: 'public-complaint-create',
    methods: ['POST'],
    pattern: /^\/api\/public\/complaints$/,
    windowMs: day,
    max: readLimit('PUBLIC_COMPLAINT_DAILY_RATE_LIMIT', 3),
    message:
      'You have reached the daily complaint limit. Please try again tomorrow.',
    keyGenerator: (req) =>
      identityKey(
        readBodyString(req, 'studentCode'),
        readBodyString(req, 'nationalId'),
        readBodyString(req, 'contactEmail'),
        getClientIp(req),
      ),
  },
  {
    name: 'faq-chat',
    methods: ['POST'],
    pattern: /^\/api\/faqs\/chat$/,
    windowMs: 10 * minute,
    max: readLimit('FAQ_CHAT_RATE_LIMIT', 20),
    message: 'Too many chat requests. Please try again later.',
  },
  {
    name: 'admin-uploads',
    methods: ['POST'],
    pattern: /^\/api\/admin\/uploads$/,
    windowMs: hour,
    max: readLimit('ADMIN_UPLOAD_RATE_LIMIT', 20),
    message: 'Too many upload requests. Please try again later.',
  },
  {
    name: 'admin-messaging',
    methods: ['POST'],
    pattern: /^\/api\/admin\/(emails|notifications)$/,
    windowMs: hour,
    max: readLimit('ADMIN_MESSAGE_RATE_LIMIT', 30),
    message: 'Too many messaging requests. Please try again later.',
  },
];

export function findRateLimitRule(req: Request): RateLimitRule | undefined {
  const method = req.method.toUpperCase();
  const path = req.path || req.originalUrl.split('?')[0];
  return rateLimitRules.find(
    (rule) => rule.methods.includes(method) && rule.pattern.test(path),
  );
}
