import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main() {
  const url =
    process.env.DATABASE_URL ?? 'postgres://finflow:finflow@localhost:5432/finflow';
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied.');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
