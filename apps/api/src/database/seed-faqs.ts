/**
 * Standalone idempotent FAQ seed script.
 * Inserts curated bilingual starter FAQs without overwriting any existing entries.
 * Run with: pnpm --filter @student-portal/api run seed:faqs
 */
import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'node:path';
import * as dns from 'node:dns';
import { DEFAULT_FAQ_ITEMS } from '../modules/faqs/default-faqs.data';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function normalizeList(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean))];
}

async function seedFaqs() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required in environment');
  }

  if (uri.startsWith('mongodb+srv://')) {
    try {
      dns.setServers(['1.1.1.1', '8.8.8.8']);
    } catch {
      // Ignore if DNS override is restricted in current environment
    }
  }

  const connection = await mongoose.createConnection(uri).asPromise();
  try {
    const faqsCollection = connection.collection('faqs');
    const now = new Date();
    let inserted = 0;
    let skipped = 0;

    for (const item of DEFAULT_FAQ_ITEMS) {
      const result = await faqsCollection.updateOne(
        { question: item.question },
        {
          $setOnInsert: {
            question: item.question,
            answer: item.answer,
            topics: normalizeList(item.topics),
            keywords: normalizeList(item.keywords),
            isActive: item.isActive,
            sortOrder: item.sortOrder,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true },
      );

      if (result.upsertedCount > 0) {
        inserted += 1;
      } else {
        skipped += 1;
      }
    }

    console.log(
      `FAQ seed complete: inserted=${inserted}, skipped=${skipped}, total=${DEFAULT_FAQ_ITEMS.length}`,
    );
  } finally {
    await connection.close();
  }
}

seedFaqs().catch((error) => {
  console.error('FAQ seed failed:', error);
  process.exit(1);
});
