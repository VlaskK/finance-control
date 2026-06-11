import { Controller, Get } from '@nestjs/common';

// Фаза 2 (§9): LLM-саммари на агрегатах (NFR-PR1 — без сырых операций).
// В v1 — честная заглушка.
@Controller('insights')
export class InsightsController {
  @Get('monthly')
  monthly() {
    return {
      available: false,
      message: 'Инсайты появятся в фазе 2 — после выноса приложения за localhost.',
    };
  }
}
