// 元CSV(Shift-JIS)を UTF-8 デコードしてオブジェクト配列に変換する。
// 列ホワイトリストは csv-mapping.ts 側で適用するため、ここでは生のヘッダー → 値の dict を返す。

import { readFileSync } from 'node:fs';
import iconv from 'iconv-lite';
import { parse } from 'csv-parse/sync';

export function loadCsv(path: string): Record<string, string>[] {
  const buf = readFileSync(path);
  const text = iconv.decode(buf, 'Shift_JIS');
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: false,
  }) as Record<string, string>[];
  return records;
}
