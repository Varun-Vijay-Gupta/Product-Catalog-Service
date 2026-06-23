require('dotenv').config();

const { randomUUID } = require('crypto');
const prisma = require('./db');

const TOTAL_PRODUCTS = 200_000;
const BATCH_SIZE = 5_000;

const CATEGORIES = ['Electronics', 'Books', 'Clothing', 'Sports', 'Home'];

function buildBatch(batchIndex, batchSize) {
  const startIndex = batchIndex * BATCH_SIZE;
  const count = Math.min(batchSize, TOTAL_PRODUCTS - startIndex);
  const baseTime = new Date();

  const records = [];

  for (let i = 0; i < count; i++) {
    const index = startIndex + i;
    records.push({
      id: randomUUID(),
      name: `Product ${index + 1}`,
      category: CATEGORIES[index % CATEGORIES.length],
      price: (Math.random() * 999 + 1).toFixed(2),
      created_at: baseTime,
      updated_at: baseTime,
    });
  }

  return records;
}

async function seed() {
  console.log(`Seeding ${TOTAL_PRODUCTS.toLocaleString()} products in batches of ${BATCH_SIZE.toLocaleString()}...`);

  const existingCount = await prisma.product.count();
  if (existingCount > 0) {
    console.log(`Database already has ${existingCount.toLocaleString()} products. Skipping seed.`);
    console.log('To re-seed, clear the products table first.');
    return;
  }

  const totalBatches = Math.ceil(TOTAL_PRODUCTS / BATCH_SIZE);
  const startedAt = Date.now();

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const data = buildBatch(batchIndex, BATCH_SIZE);

    // createMany inserts an entire batch in one SQL statement — much faster than
    // 5,000 individual INSERT calls.
    await prisma.product.createMany({ data });

    const inserted = (batchIndex + 1) * BATCH_SIZE;
    const progress = Math.min(inserted, TOTAL_PRODUCTS);
    console.log(`  Batch ${batchIndex + 1}/${totalBatches} — ${progress.toLocaleString()} / ${TOTAL_PRODUCTS.toLocaleString()}`);
  }

  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Done. Inserted ${TOTAL_PRODUCTS.toLocaleString()} products in ${elapsedSeconds}s.`);
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
