import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Localhost-периметр (NFR-S1): auth появится только при выносе на VPS (фаза 2).
  app.enableCors();
  // Чтобы onModuleDestroy (остановка Telegram-бота) срабатывал на SIGINT/SIGTERM.
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`FinFlow API: http://localhost:${port}`);
}

bootstrap();
