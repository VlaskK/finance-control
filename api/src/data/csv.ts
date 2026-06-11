// Чистые функции CSV (FR-G1, FR-G2) — под юнит-тесты (NFR-T1).
// Экспорт — с ';' (дружелюбно к русскому Excel), импорт принимает ';' и ','.

export function detectDelimiter(headerLine: string): string {
  const semicolons = (headerLine.match(/;/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  return semicolons >= commas ? ';' : ',';
}

export function parseCsv(text: string): string[][] {
  const normalized = text.replace(/^﻿/, ''); // BOM из Excel
  const firstLine = normalized.slice(0, normalized.indexOf('\n') + 1 || undefined);
  const delimiter = detectDelimiter(firstLine);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && normalized[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = cell === null || cell === undefined ? '' : String(cell);
          return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(';'),
    )
    .join('\r\n');
}

// '1 234,56', '1234.56', '1.234,56', '₽ 500' → число; мусор → null
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[^\d,.-]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56 → 1234.56
  } else {
    s = s.replace(/,/g, ''); // 1,234.56 → 1234.56
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

// 'ГГГГ-ММ-ДД', 'ДД.ММ.ГГГГ', 'ДД/ММ/ГГГГ' → ISO-дата; мусор → null
export function parseDateCell(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return validate(`${m[1]}-${m[2]}-${m[3]}`);
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return validate(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  return null;

  function validate(iso: string): string | null {
    const dt = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso ? null : iso;
  }
}

// Сопоставление заголовков CSV-импорта (FR-G2): русские и английские варианты
const HEADER_ALIASES: Record<string, string[]> = {
  date: ['date', 'дата'],
  amount: ['amount', 'сумма'],
  category: ['category', 'категория'],
  subcategory: ['subcategory', 'подкатегория'],
  label: ['label', 'метка', 'место'],
  note: ['note', 'примечание', 'комментарий', 'заметка'],
  type: ['type', 'тип'],
};

export function mapHeaders(headerRow: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  headerRow.forEach((raw, i) => {
    const name = raw.trim().toLowerCase();
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(name) && result[key] === undefined) result[key] = i;
    }
  });
  return result;
}

const TYPE_ALIASES: Record<string, 'expense' | 'transfer' | 'income'> = {
  expense: 'expense',
  расход: 'expense',
  transfer: 'transfer',
  перевод: 'transfer',
  накопление: 'transfer',
  income: 'income',
  доход: 'income',
};

export function parseTypeCell(raw: string): 'expense' | 'transfer' | 'income' | null {
  return TYPE_ALIASES[raw.trim().toLowerCase()] ?? null;
}
