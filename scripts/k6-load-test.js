import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Student Portal - k6 Load & Stress Test Scenario with Database & Metrics
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Runs locally or against any deployed remote environment.
 *
 * Usage:
 *   # Local run:
 *   k6 run scripts/k6-load-test.js
 *
 *   # Remote environment:
 *   k6 run -e TARGET_URL=https://api.yourdomain.com/api scripts/k6-load-test.js
 */

const TARGET_URL = (__ENV.TARGET_URL || 'http://localhost:4000/api').replace(/\/$/, '');
const IDENTIFIER = __ENV.STUDENT_IDENTIFIER || '20240001';
const PASSWORD = __ENV.STUDENT_PASSWORD || 'Password@123';
const TEST_QUIZ_ID = __ENV.QUIZ_ID || '';

export const options = {
  stages: [
    { duration: '20s', target: 30 },   // Warm-up to 30 concurrent students
    { duration: '1m', target: 100 },   // Ramp-up to 100 concurrent students
    { duration: '1m', target: 300 },   // Peak sustained load: 300 concurrent students
    { duration: '20s', target: 0 },    // Cooldown
  ],
  thresholds: {
    http_req_failed: ['rate<0.02'],              // < 2% HTTP failures allowed
    http_req_duration: ['p(95)<800', 'p(99)<2000'], // 95% of requests under 800ms
  },
};

export default function () {
  // 1. Health Probe (verifies API + live MongoDB Ping Latency)
  const healthRes = http.get(`${TARGET_URL}/health`);
  check(healthRes, {
    'health check status is 200': (r) => r.status === 200,
    'database is connected': (r) => {
      try {
        const body = r.json();
        return body && body.database && body.database.status === 'connected';
      } catch (_) {
        return false;
      }
    },
  });

  // 2. Metrics Scraping Probe (verifies Prometheus endpoint)
  const metricsRes = http.get(`${TARGET_URL}/metrics`);
  check(metricsRes, {
    'metrics endpoint status is 200': (r) => r.status === 200,
    'metrics contains student_portal metrics': (r) =>
      typeof r.body === 'string' && r.body.includes('student_portal_'),
  });

  // 3. Database Read Stress: Public Courses & FAQs
  const coursesRes = http.get(`${TARGET_URL}/courses`);
  check(coursesRes, {
    'courses read status is 200': (r) => r.status === 200,
  });

  const faqsRes = http.get(`${TARGET_URL}/faqs`);
  check(faqsRes, {
    'faqs read status is 200': (r) => r.status === 200,
  });

  // 4. Student Authentication
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

  // 5. Authenticated DB Read: Fetch Student Online Quizzes
  const quizzesRes = http.get(`${TARGET_URL}/quizzes/student`, { headers });
  check(quizzesRes, {
    'quizzes status is 200': (r) => r.status === 200,
  });

  // 6. Authenticated DB Write: Simulate Autosave Draft (if quiz ID provided)
  if (TEST_QUIZ_ID) {
    sleep(0.5);
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

  sleep(1.5);
}
