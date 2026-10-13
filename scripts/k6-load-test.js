import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Student Portal - k6 Load & Stress Test Scenario
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Runs locally or against any deployed remote environment.
 *
 * Usage:
 *   # Local run:
 *   k6 run scripts/k6-load-test.js
 *
 *   # Deployed environment:
 *   k6 run -e TARGET_URL=https://api.yourdomain.com/api scripts/k6-load-test.js
 */

const TARGET_URL = (__ENV.TARGET_URL || 'http://localhost:4000/api').replace(/\/$/, '');
const IDENTIFIER = __ENV.STUDENT_IDENTIFIER || '20240001';
const PASSWORD = __ENV.STUDENT_PASSWORD || 'Password@123';
const TEST_QUIZ_ID = __ENV.QUIZ_ID || '';

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Warm-up to 50 concurrent students
    { duration: '1m', target: 200 },   // Ramp-up to 200 concurrent students
    { duration: '2m', target: 500 },   // Peak sustained load: 500 concurrent students
    { duration: '30s', target: 0 },    // Cooldown
  ],
  thresholds: {
    http_req_failed: ['rate<0.02'],              // < 2% HTTP failures
    http_req_duration: ['p(95)<800', 'p(99)<2000'], // 95% of requests under 800ms
  },
};

export default function () {
  // 1. Health Probe
  const healthRes = http.get(`${TARGET_URL}/health`);
  check(healthRes, {
    'health check status is 200': (r) => r.status === 200,
  });

  // 2. Student Authentication
  const loginRes = http.post(
    `${TARGET_URL}/auth/login`,
    JSON.stringify({
      identifier: IDENTIFIER,
      password: PASSWORD,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  const loginOk = check(loginRes, {
    'login status is 200/201': (r) => r.status === 200 || r.status === 201,
  });

  if (!loginOk) {
    sleep(1);
    return;
  }

  const token = loginRes.json('accessToken');
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // 3. Fetch Student Online Quizzes
  const quizzesRes = http.get(`${TARGET_URL}/quizzes/student`, { headers });
  check(quizzesRes, {
    'quizzes status is 200': (r) => r.status === 200,
  });

  // 4. If a quiz ID is provided, simulate answering & autosave
  if (TEST_QUIZ_ID) {
    sleep(1);
    const draftRes = http.patch(
      `${TARGET_URL}/quizzes/${TEST_QUIZ_ID}/draft`,
      JSON.stringify({
        answers: [{ questionId: 'q1', selectedOptionIndex: 1 }],
      }),
      { headers }
    );
    check(draftRes, {
      'draft autosave status is 200': (r) => r.status === 200,
    });
  }

  sleep(2);
}
