// Verify the supplied CSV observations without retaining request IDs or query values.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

function csv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index+1] === '"') {field += '"'; index++;}
      else quoted = !quoted;
    } else if (!quoted && char === ',') {row.push(field); field = '';}
    else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[index+1] === '\n') index++;
      row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = '';
    } else field += char;
  }
  if (quoted) throw new Error('Unterminated CSV field');
  if (field || row.length) {row.push(field); rows.push(row);}
  return rows.slice(1);
}

const directory = process.argv[2];
if (!directory) throw new Error('Supply the folder containing the four CSV exports');
const files = [
  'endpoints-latency-2026-10-28-01-55-43.csv', 'slow-requests-correlation.csv',
  'slow-queries-2026-10-28-01-55-50.csv', 'traffic-routes-diagnostics.csv',
];
const inputs = await Promise.all(files.map(async (name) => {
  const data = await readFile(join(directory,name));
  return {name, sha256:createHash('sha256').update(data).digest('hex'), rows:csv(data.toString('utf8').replace(/^\uFEFF/,''))};
}));
const selectedRoutes = new Set(['POST /api/admin/courses/:id/enroll-students-batch', 'GET /api/admin/complaints', 'GET /api/admin/students', 'GET /api/admin/courses', 'GET /api/registration/eligibility']);
const slowOperations = {};
for (const row of inputs[2].rows) {const key = `${row[0]}.${row[1]}`; slowOperations[key] = (slowOperations[key] ?? 0)+1;}
const result = {
  sources: inputs.map(({name,sha256,rows}) => ({name,sha256,rowCount:rows.length})),
  endpoints: inputs[0].rows.filter((row) => selectedRoutes.has(row[0])).map((row) => ({route:row[0],requests:Number(row[2]),meanMs:Number(row[3]),maxMs:Number(row[4]),clientErrors:Number(row[5]),serverErrors:Number(row[6]),statusCounts:row[7]})),
  correlations: inputs[1].rows.map((row) => ({method:row[1],route:row[2],status:Number(row[3]),httpMs:Number(row[4]),databaseCalls:Number(row[5]),summedDatabaseMs:Number(row[6]),stages:JSON.parse(row[8])})),
  sampledSlowOperations: slowOperations,
  traffic: inputs[3].rows.map((row) => ({method:row[0],route:row[1],requests:Number(row[2]),reportedP95Ms:Number(row[3]),clientErrors:Number(row[4]),serverErrors:Number(row[5])})),
  limitations: 'No enrollment batch sizes, HTTP time series, representative staging workload, production query plans, request IDs, or raw query values retained. Slow-query rows are a sample, not lifetime counts.',
};
await writeFile(new URL('BASELINE_EVIDENCE.json',import.meta.url), `${JSON.stringify(result,null,2)}\n`);
console.log(`Verified ${inputs.map((input) => `${input.rows.length} rows`).join(', ')}; wrote sanitized BASELINE_EVIDENCE.json`);
