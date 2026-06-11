import { Global, Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export const DB = Symbol('DB');
export type Database = ReturnType<typeof drizzle<typeof schema>>;

const databaseProvider = {
  provide: DB,
  useFactory: (): Database => {
    const url =
      process.env.DATABASE_URL ?? 'postgres://finflow:finflow@localhost:5432/finflow';
    const client = postgres(url);
    return drizzle(client, { schema });
  },
};

@Global()
@Module({
  providers: [databaseProvider],
  exports: [databaseProvider],
})
export class DatabaseModule {}
