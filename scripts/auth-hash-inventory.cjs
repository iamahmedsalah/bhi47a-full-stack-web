// Read-only: the database returns aggregate format counts, never hashes or users.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const apiRequire = createRequire(path.resolve(__dirname, '../apps/api/package.json'));
const { MongoClient } = apiRequire('mongodb');
const dotenv = apiRequire('dotenv');
const dns = require('node:dns');
const { isIP } = require('node:net');

async function main() {
  const envPath = path.resolve(__dirname, '../.env');
  const fileEnv = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {};
  const uri = process.env.MONGODB_URI || fileEnv.MONGODB_URI;
  if (!uri) throw new Error('missing-configuration');
  const dnsServers = (process.env.DNS_SERVERS || fileEnv.DNS_SERVERS || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (dnsServers.length && dnsServers.every((value) => isIP(value))) dns.setServers(dnsServers);
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 1, appName: 'auth-format-inventory-readonly' });
  try {
    await client.connect();
    const input = { $cond: [{ $eq: [{ $type: '$passwordHash' }, 'string'] }, '$passwordHash', ''] };
    const counts = await client.db().collection('users').aggregate([
      { $group: { _id: { $switch: { branches: [
        { case: { $regexMatch: { input, regex: '^\\$2a\\$' } }, then: 'bcrypt-2a' },
        { case: { $regexMatch: { input, regex: '^\\$2b\\$' } }, then: 'bcrypt-2b' },
        { case: { $regexMatch: { input, regex: '^\\$2y\\$' } }, then: 'bcrypt-2y-unsupported-by-node-bcrypt' },
        { case: { $regexMatch: { input, regex: '^\\$argon2id\\$' } }, then: 'argon2id' },
        { case: { $regexMatch: { input, regex: '^\\$scrypt\\$' } }, then: 'scrypt-review-required' },
      ], default: 'unknown-or-missing' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ], { maxTimeMS: 10000, allowDiskUse: false }).toArray();
    const bcryptCosts = await client.db().collection('users').aggregate([
      { $match: { passwordHash: { $regex: '^\\$2[aby]\\$[0-9]{2}\\$' } } },
      { $group: { _id: { $substrBytes: ['$passwordHash', 4, 2] }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ], { maxTimeMS: 10000, allowDiskUse: false }).toArray();
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), readOnly: true, counts, bcryptCosts }, null, 2));
  } finally { await client.close(); }
}
main().catch(() => { console.error('BLOCKED: read-only hash-format inventory unavailable; no hashes or account records exported.'); process.exitCode = 1; });
