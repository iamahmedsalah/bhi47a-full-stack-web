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
  return req.ip || req.socket.remoteAddress || 'unknown';
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
    name: 'google-nonce',
    methods: ['POST'],
    pattern: /^\/api\/auth\/google\/nonce$/,
    windowMs: minute,
    max: readLimit('GOOGLE_NONCE_RATE_LIMIT', 1200),
    message: 'Too many Google sign-in preparations. Please retry shortly.',
  },
  {
    name: 'google-auth',
    methods: ['POST'],
    pattern: /^\/api\/auth\/google\/login$/,
    windowMs: minute,
    max: readLimit('GOOGLE_AUTH_RATE_LIMIT', 1200),
    message: 'Too many Google authentication attempts. Please retry later.',
  },
  {
    name: 'google-link',
    scope: 'authenticated',
    methods: ['POST', 'DELETE'],
    pattern: /^\/api\/auth\/google\/link(?:\/.*)?$/,
    windowMs: 15 * minute,
    max: readLimit('GOOGLE_LINK_RATE_LIMIT', 12),
    message: 'Too many Google linking attempts. Please retry later.',
  },
  {
    name: 'auth-security',
    scope: 'authenticated',
    methods: ['POST', 'DELETE'],
    pattern: /^\/api\/auth\/(reauthenticate|sessions(?:\/.*)?|logout-all)$/,
    windowMs: 5 * minute,
    max: readLimit('AUTH_SECURITY_RATE_LIMIT', 12),
    message: 'Too many security operations. Please retry later.',
  },
  {
    name: 'passkeys',
    methods: ['POST'],
    pattern: /^\/api\/auth\/passkeys\/login\/(options|verify)$/,
    windowMs: minute,
    max: readLimit('PASSKEY_LOGIN_RATE_LIMIT', 1800),
    message: 'Too many passkey login attempts. Please retry shortly.',
    keyGenerator: getClientIp,
  },
  {
    name: 'passkey-security',
    scope: 'authenticated',
    methods: ['POST', 'PATCH', 'DELETE'],
    pattern: /^\/api\/auth\/passkeys(?:\/(?!login\/).*)?$/,
    windowMs: 5 * minute,
    max: readLimit('PASSKEY_RATE_LIMIT', 20),
    message: 'Too many passkey attempts. Please try again later.',
  },
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
    scope: 'authenticated',
    methods: ['POST'],
    pattern: /^\/api\/auth\/change-password$/,
    windowMs: 15 * minute,
    max: readLimit('CHANGE_PASSWORD_RATE_LIMIT', 8),
    message: 'Too many password change attempts. Please try again later.',
  },
  {
    name: 'student-complaint-create',
    scope: 'authenticated',
    methods: ['POST'],
    pattern: /^\/api\/students\/complaints$/,
    windowMs: day,
    max: readLimit('STUDENT_COMPLAINT_DAILY_RATE_LIMIT', 3),
    message:
      'You have reached the daily complaint limit. Please try again tomorrow.',
  },
  {
    name: 'student-complaint-reply',
    scope: 'authenticated',
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
    scope: 'authenticated',
    methods: ['POST'],
    pattern: /^\/api\/admin\/uploads$/,
    windowMs: hour,
    max: readLimit('ADMIN_UPLOAD_RATE_LIMIT', 20),
    message: 'Too many upload requests. Please try again later.',
  },
  {
    name: 'admin-messaging',
    scope: 'authenticated',
    methods: ['POST'],
    pattern: /^\/api\/admin\/(emails|notifications)$/,
    windowMs: hour,
    max: readLimit('ADMIN_MESSAGE_RATE_LIMIT', 30),
    message: 'Too many messaging requests. Please try again later.',
  },
  {
    name: 'forgot-password',
    methods: ['POST'],
    pattern: /^\/api\/auth\/forgot-password$/,
    windowMs: 15 * minute,
    max: readLimit('FORGOT_PASSWORD_RATE_LIMIT', 5),
    message: 'Too many password recovery attempts. Please try again later.',
    keyGenerator: (req) =>
      identityKey(
        readBodyString(req, 'identifier'),
        readBodyString(req, 'studentCode'),
        readBodyString(req, 'email'),
        getClientIp(req),
      ),
  },
  {
    name: 'reset-password-otp',
    methods: ['POST'],
    pattern: /^\/api\/auth\/reset-password-otp$/,
    windowMs: 15 * minute,
    max: readLimit('RESET_PASSWORD_OTP_RATE_LIMIT', 5),
    message: 'Too many OTP verification attempts. Please wait 15 minutes.',
    keyGenerator: (req) =>
      identityKey(
        readBodyString(req, 'identifier'),
        readBodyString(req, 'studentCode'),
        readBodyString(req, 'email'),
        getClientIp(req),
      ),
  },
  {
    name: 'google-verify-otp',
    scope: 'authenticated',
    methods: ['POST'],
    pattern: /^\/api\/auth\/google\/link\/verify-otp$/,
    windowMs: 15 * minute,
    max: readLimit('GOOGLE_OTP_RATE_LIMIT', 5),
    message: 'Too many Google OTP attempts. Please try again later.',
  },
  {
    name: 'student-ai-chat',
    scope: 'authenticated',
    methods: ['POST'],
    pattern: /^\/api\/student\/chat\/messages?$/,
    windowMs: 10 * minute,
    max: readLimit('STUDENT_AI_CHAT_RATE_LIMIT', 25),
    message: 'Too many AI chat messages. Please wait a moment.',
  },
  {
    name: 'admin-exports',
    scope: 'authenticated',
    methods: ['GET'],
    pattern: /^\/api\/admin\/.+\/export(\/excel)?$/,
    windowMs: 10 * minute,
    max: readLimit('ADMIN_EXPORT_RATE_LIMIT', 15),
    message: 'Too many data export requests. Please wait a moment.',
  },
  {
    name: 'quiz-submit',
    scope: 'authenticated',
    methods: ['POST'],
    pattern:
      /^\/api\/(courses\/[^/]+\/quizzes\/[^/]+\/submit|students\/me\/quizzes\/[^/]+\/(submit|start|exit))$/,
    windowMs: minute,
    max: readLimit('QUIZ_SUBMIT_RATE_LIMIT', 30),
    message: 'Too many quiz requests. Please wait a moment.',
  },
  {
    name: 'quiz-draft',
    scope: 'authenticated',
    methods: ['POST'],
    pattern: /^\/api\/students\/me\/quizzes\/[^/]+\/save-draft$/,
    windowMs: minute,
    max: readLimit('QUIZ_DRAFT_RATE_LIMIT', 60),
    message: 'Too many quiz saves. Please wait a moment.',
  },
];

export function findRateLimitRule(req: Request): RateLimitRule | undefined {
  const method = req.method.toUpperCase();
  const path = req.path || req.originalUrl.split('?')[0];
  return rateLimitRules.find(
    (rule) => rule.methods.includes(method) && rule.pattern.test(path),
  );
}

export function findRateLimitRules(req: Request): RateLimitRule[] {
  const method = req.method.toUpperCase();
  const path = req.path || req.originalUrl.split('?')[0];
  const rules = rateLimitRules.filter(
    (rule) => rule.methods.includes(method) && rule.pattern.test(path),
  );
  // Anonymous preparation must not spend the password/credential budget.
  // Authenticated rules run after JWT verification and have a per-user budget.
  if (
    !rules.some((rule) => !rule.scope && rule.name !== 'google-nonce') ||
    !/^\/api\/auth\//.test(path)
  )
    return rules;
  return [
    {
      name: 'auth-ip',
      methods: ['POST', 'PATCH', 'DELETE'],
      pattern: /^\/api\/auth\//,
      windowMs: minute,
      max: readLimit('AUTH_IP_RATE_LIMIT', 2400),
      message: 'Too many authentication requests. Please retry later.',
      keyGenerator: getClientIp,
    },
    ...rules,
  ];
}
