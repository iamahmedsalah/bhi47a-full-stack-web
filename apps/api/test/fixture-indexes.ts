import type { IndexDefinition, IndexOptions, mongo } from 'mongoose';

interface FixtureIndexModel {
  db: { host: string; name: string };
  schema: { indexes(): Array<[IndexDefinition, IndexOptions]> };
  createCollection(): Promise<unknown>;
  collection: {
    createIndexes(indexes: mongo.IndexDescription[]): Promise<unknown>;
  };
}

/** Provision every declared index with one command per isolated fixture model.
 * Mongoose init() otherwise sends each createIndex separately, causing many
 * concurrent DDL commits across the performance fixture's model collection.
 * No index or constraint is omitted, and no existing index is removed.
 */
export async function createFixtureIndexes(
  model: FixtureIndexModel,
): Promise<void> {
  if (
    !['localhost', '127.0.0.1', '::1'].includes(model.db.host) ||
    !/(?:test|e2e)$/.test(model.db.name)
  ) {
    throw new Error(
      'Fixture indexes require an isolated localhost test database',
    );
  }
  await model.createCollection();
  const indexes = model.schema.indexes().map(([key, options]) => ({
    ...options,
    key,
  }));
  if (indexes.length > 0) {
    await model.collection.createIndexes(indexes as mongo.IndexDescription[]);
  }
}
