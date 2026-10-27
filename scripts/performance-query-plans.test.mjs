import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeExplain } from './performance-query-plans.mjs';

test('reports winning plan scans/sorts and numeric stats without returning filters or rejected plans', () => {
  const result = summarizeExplain({
    command: { filter: { studentId: 'private' } },
    queryPlanner: {
      winningPlan: { stage: 'SORT', inputStage: { stage: 'FETCH', inputStage: { stage: 'IXSCAN', indexName: 'status_1' } } },
      rejectedPlans: [{ stage: 'COLLSCAN' }],
    },
    executionStats: { executionTimeMillis: 10, totalDocsExamined: 80, totalKeysExamined: 80, nReturned: 20 },
  });
  assert.deepEqual(result.stages, ['FETCH', 'IXSCAN', 'SORT']);
  assert.deepEqual(result.indexes, ['status_1']);
  assert.equal(result.totalDocsExamined, 80);
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('reads aggregation cursor statistics and nested SBE winning plans', () => {
  const result = summarizeExplain({ stages: [{ $cursor: {
    queryPlanner: { winningPlan: { queryPlan: { stage: 'IXSCAN', indexName: 'createdAt_-1__id_-1' } } },
    executionStats: { executionTimeMillis: 2, totalDocsExamined: 20, totalKeysExamined: 20, nReturned: 20 },
  } }] });
  assert.equal(result.nReturned, 20);
  assert.deepEqual(result.stages, ['IXSCAN']);
});
