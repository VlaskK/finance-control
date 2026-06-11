import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DEFAULT_CATEGORIES } from './default-categories';
import { categories } from './schema';

// Идемпотентный сидинг дефолтной таксономии (Приложение A).
async function main() {
  const url =
    process.env.DATABASE_URL ?? 'postgres://finflow:finflow@localhost:5432/finflow';
  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema: { categories } });

  const existing = await db.select({ count: sql<number>`count(*)` }).from(categories);
  if (Number(existing[0].count) > 0) {
    console.log('Categories already present — skipping seed.');
    await client.end();
    return;
  }

  let sortOrder = 0;
  for (const cat of DEFAULT_CATEGORIES) {
    const [parent] = await db
      .insert(categories)
      .values({
        name: cat.name,
        type: cat.type,
        color: cat.color,
        description: cat.description,
        sortOrder: sortOrder++,
      })
      .returning();

    if (cat.children?.length) {
      let childOrder = 0;
      for (const childName of cat.children) {
        await db.insert(categories).values({
          name: childName,
          type: cat.type,
          color: cat.color,
          parentId: parent.id,
          sortOrder: childOrder++,
        });
      }
    }
  }

  console.log(`Seeded ${DEFAULT_CATEGORIES.length} top-level categories.`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
