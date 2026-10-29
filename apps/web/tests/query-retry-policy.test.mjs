import assert from 'node:assert/strict';
import { test } from 'node:test';
import { queryRetry, queryRetryDelay, retryAfterDeadline } from '../src/lib/query-retry-policy.ts';

test('auth and other permanent client failures never get automatic query retries',()=>{
  for(const statusCode of [400,401,403,404,409,422]) assert.equal(queryRetry(0,{statusCode}),false);
  assert.equal(queryRetry(0,{response:{status:401}}),false);
  assert.equal(queryRetry(0,{statusCode:503}),true);
  assert.equal(queryRetry(1,{statusCode:503}),false);
  assert.equal(queryRetry(0,new Error('Network Error')),true);
});
test('429 retries are bounded and honor delta seconds and HTTP dates',()=>{
  const now=Date.now();
  assert.equal(retryAfterDeadline('60',now),now+60000);
  assert.equal(retryAfterDeadline('-1',now),undefined);
  assert.equal(retryAfterDeadline('invalid',now),undefined);
  const date = new Date(Math.ceil((now+120000)/1000)*1000).toUTCString();
  assert.equal(retryAfterDeadline(date,now),Date.parse(date));
  assert.equal(queryRetry(0,{statusCode:429}),false);
  const error={statusCode:429,retryAfterAt:now+60000};
  assert.equal(queryRetry(0,error),true); assert.equal(queryRetry(1,error),false);
  assert.ok(queryRetryDelay(0,error)>59000);
  assert.equal(queryRetry(0,{statusCode:429,retryAfterAt:now+600000}),false);
  assert.equal(queryRetry(0,{statusCode:503,retryAfterAt:now+600000}),false);
});
