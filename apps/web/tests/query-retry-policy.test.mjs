import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  queryRetry,
  queryRetryDelay,
  retryAfterDeadline,
} from "../src/lib/query-retry-policy.ts";

test("auth and other permanent client failures never get automatic query retries", () => {
  for (const statusCode of [400, 401, 403, 404, 409, 422])
    assert.equal(queryRetry(0, { statusCode }), false);
  assert.equal(queryRetry(0, { response: { status: 401 } }), false);
  assert.equal(queryRetry(0, { statusCode: 503 }), true);
  assert.equal(queryRetry(1, { statusCode: 503 }), false);
  assert.equal(queryRetry(0, new Error("Network Error")), true);
});

test("TanStack executes permanent failures once and transient failures at most twice", async () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: queryRetry, retryDelay: () => 0, gcTime: 0 },
    },
  });
  try {
    for (const statusCode of [401, 403, 429, 503]) {
      let calls = 0;
      await assert.rejects(
        client.fetchQuery({
          queryKey: ["failure", statusCode],
          queryFn: () => {
            calls++;
            throw { statusCode };
          },
        }),
      );
      assert.equal(calls, statusCode === 503 ? 2 : 1);
    }
    let calls = 0;
    await assert.rejects(
      client.fetchQuery({
        queryKey: ["bounded-429"],
        queryFn: () => {
          calls++;
          throw { statusCode: 429, retryAfterAt: Date.now() + 1000 };
        },
      }),
    );
    assert.equal(calls, 2);
  } finally {
    client.clear();
  }
});
test("429 retries are bounded and honor delta seconds and HTTP dates", () => {
  const now = Date.now();
  assert.equal(retryAfterDeadline("60", now), now + 60000);
  assert.equal(retryAfterDeadline("-1", now), undefined);
  assert.equal(retryAfterDeadline("invalid", now), undefined);
  const date = new Date(Math.ceil((now + 120000) / 1000) * 1000).toUTCString();
  assert.equal(retryAfterDeadline(date, now), Date.parse(date));
  assert.equal(queryRetry(0, { statusCode: 429 }), false);
  const error = { statusCode: 429, retryAfterAt: now + 60000 };
  assert.equal(queryRetry(0, error), true);
  assert.equal(queryRetry(1, error), false);
  assert.ok(queryRetryDelay(0, error) > 59000);
  assert.equal(
    queryRetry(0, { statusCode: 429, retryAfterAt: now + 600000 }),
    false,
  );
  assert.equal(
    queryRetry(0, { statusCode: 503, retryAfterAt: now + 600000 }),
    false,
  );
});
