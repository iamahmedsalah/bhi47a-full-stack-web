import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { createFixtureIndexes } from './fixture-indexes';

describe('isolated fixture index provisioning', () => {
  it('rejects non-local models before issuing DDL', async () => {
    const createCollection = jest.fn();
    await expect(
      createFixtureIndexes({
        db: { host: 'production.example.test', name: 'student-portal-e2e' },
        createCollection,
      } as never),
    ).rejects.toThrow('isolated localhost');
    expect(createCollection).not.toHaveBeenCalled();
  });

  it('keeps unique, TTL and partial constraints and remains idempotent', async () => {
    const uri = new URL(process.env.MONGODB_URI ?? '');
    if (
      uri.protocol !== 'mongodb:' ||
      uri.hostname !== '127.0.0.1' ||
      !uri.pathname.endsWith('-e2e') ||
      uri.username ||
      uri.password ||
      uri.search
    ) {
      throw new Error(
        'Index fixture requires credential-free loopback E2E database',
      );
    }
    const connection = await mongoose
      .createConnection(uri.href, {
        autoIndex: false,
        autoCreate: false,
        maxPoolSize: 2,
        serverSelectionTimeoutMS: 3000,
      })
      .asPromise();
    try {
      const schema = new mongoose.Schema({
        code: String,
        attempts: Number,
        expiresAt: Date,
      });
      schema.index({ code: 1 }, { unique: true });
      schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      schema.index(
        { attempts: 1 },
        { partialFilterExpression: { attempts: { $gte: 5 } } },
      );
      const name = 'fixture_indexes_' + randomUUID().replaceAll('-', '');
      const records = connection.model(name, schema, name);
      await createFixtureIndexes(records);
      await createFixtureIndexes(records);
      const indexes = await records.collection.indexes();
      expect(indexes).toHaveLength(4); // All declared indexes plus MongoDB's _id.
      expect(indexes.find((index) => index.key.code)).toMatchObject({
        unique: true,
      });
      expect(indexes.find((index) => index.key.expiresAt)).toMatchObject({
        expireAfterSeconds: 0,
      });
      expect(indexes.find((index) => index.key.attempts)).toMatchObject({
        partialFilterExpression: { attempts: { $gte: 5 } },
      });
      await records.create({ code: 'synthetic' });
      await expect(records.create({ code: 'synthetic' })).rejects.toMatchObject(
        { code: 11000 },
      );
    } finally {
      await connection.close();
    }
  });
});
