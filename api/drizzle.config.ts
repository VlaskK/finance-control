import type { Config } from 'drizzle-kit';

export default {
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://finflow:finflow@localhost:5432/finflow',
  },
} satisfies Config;
