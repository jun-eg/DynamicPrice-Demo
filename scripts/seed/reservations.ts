// 予約履歴シード: 元CSV(Shift-JIS) を UTF-8 化し PII を完全に除外して Reservation に投入する。
// 冪等: reservationCode をキーに findFirst + create/update。
// 失敗行: ログ出力し継続、最後に終了コード 1。
// 根拠: docs/architecture/03-data-model.md / ADR-0004 / docs/runbooks/local-development.md §5-2

import 'dotenv/config';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { prisma } from '@app/db';
import { loadCsv } from './csv-loader';
import { mapRow, type MappedRow } from './csv-mapping';

const DEFAULT_CSV_PATH = 'data/raw/ReservationTotalList.CSV';
const PROGRESS_INTERVAL = 1000;

interface RowError {
  rowNumber: number;
  reservationCode: string | null;
  message: string;
}

async function ensureRoomType(row: MappedRow, cache: Map<string, number>): Promise<number> {
  const cached = cache.get(row.roomTypeCode);
  if (cached !== undefined) return cached;

  const existing = await prisma.roomType.findUnique({ where: { code: row.roomTypeCode } });
  if (existing) {
    cache.set(row.roomTypeCode, existing.id);
    return existing.id;
  }
  // CSV 由来で未登録の RoomType。inventoryCount は不明なので 0 で投入し警告を出す。
  // 運用者は master.ts で正しい値を設定し直す必要がある。
  console.warn(
    `[reservations] 未登録の RoomType を仮投入: code=${row.roomTypeCode} name=${row.roomTypeName} (inventoryCount=0、master.ts で要更新)`,
  );
  const created = await prisma.roomType.create({
    data: { code: row.roomTypeCode, name: row.roomTypeName, capacity: null, inventoryCount: 0 },
  });
  cache.set(row.roomTypeCode, created.id);
  return created.id;
}

async function ensurePlan(row: MappedRow, cache: Map<string, number>): Promise<number> {
  // Plan は商品プラン名称を自然キーにする (issue #55, #56 / ADR-0010)。
  // 商品プランコードは捨てる: 同 name に複数 code、同 code に複数 name の双方向問題があり
  // 業務単位の集約に使えないため。
  const cached = cache.get(row.planName);
  if (cached !== undefined) return cached;

  const existing = await prisma.plan.findUnique({ where: { name: row.planName } });
  if (existing) {
    cache.set(row.planName, existing.id);
    return existing.id;
  }
  console.warn(`[reservations] 未登録の Plan を仮投入: name=${row.planName}`);
  const created = await prisma.plan.create({
    data: { name: row.planName, mealType: row.mealType },
  });
  cache.set(row.planName, created.id);
  return created.id;
}

async function upsertReservation(
  row: MappedRow,
  roomTypeId: number,
  planId: number,
): Promise<void> {
  // reservationCode は Prisma スキーマ上 UNIQUE ではないため findFirst で同定する。
  const existing = await prisma.reservation.findFirst({
    where: { reservationCode: row.reservationCode },
    select: { id: true },
  });

  const data = {
    reservationCode: row.reservationCode,
    bookedDate: row.bookedDate,
    checkInDate: row.checkInDate,
    checkOutDate: row.checkOutDate,
    nights: row.nights,
    roomCount: row.roomCount,
    bookingChannel: row.bookingChannel,
    roomTypeId,
    planId,
    adults: row.adults,
    children: row.children,
    infants: row.infants,
    totalAmount: row.totalAmount,
    adultUnitPrice: row.adultUnitPrice,
    childUnitPrice: row.childUnitPrice,
    infantUnitPrice: row.infantUnitPrice,
    cancelDate: row.cancelDate,
  } as const;

  if (existing) {
    await prisma.reservation.update({ where: { id: existing.id }, data });
  } else {
    await prisma.reservation.create({ data });
  }
}

async function main(): Promise<void> {
  const csvPath = resolve(process.env.RAW_CSV_PATH ?? DEFAULT_CSV_PATH);
  if (!existsSync(csvPath)) {
    throw new Error(
      `CSV が見つかりません: ${csvPath} (RAW_CSV_PATH を指定するか data/raw/ に配置してください)`,
    );
  }

  console.log(`[reservations] CSV を読み込み: ${csvPath}`);
  const rows = loadCsv(csvPath);
  console.log(`[reservations] CSV 行数: ${rows.length}`);

  const roomTypeCache = new Map<string, number>();
  const planCache = new Map<string, number>();
  const errors: RowError[] = [];
  let successCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2; // 1 行目はヘッダー、データは 2 行目から
    const raw = rows[i]!;
    let mapped: MappedRow;
    try {
      mapped = mapRow(raw);
    } catch (err) {
      errors.push({
        rowNumber,
        reservationCode: typeof raw['予約番号'] === 'string' ? raw['予約番号'] : null,
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    try {
      const roomTypeId = await ensureRoomType(mapped, roomTypeCache);
      const planId = await ensurePlan(mapped, planCache);
      await upsertReservation(mapped, roomTypeId, planId);
      successCount++;
    } catch (err) {
      errors.push({
        rowNumber,
        reservationCode: mapped.reservationCode,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    if ((i + 1) % PROGRESS_INTERVAL === 0) {
      console.log(
        `[reservations] 進捗 ${i + 1}/${rows.length} (成功 ${successCount}, 失敗 ${errors.length})`,
      );
    }
  }

  // 受け入れ条件: 全件数 / cancelDate=NULL 件数の両方を出す。
  // CSV 由来の数値ではなく DB の実カウントを出す(取り込み結果を確認するため)。
  const totalInDb = await prisma.reservation.count();
  const aliveInDb = await prisma.reservation.count({ where: { cancelDate: null } });

  console.log('---');
  console.log(`[reservations] 投入成功: ${successCount}`);
  console.log(`[reservations] 失敗行: ${errors.length}`);
  console.log(`[reservations] DB 全件数: ${totalInDb}`);
  console.log(`[reservations] DB cancelDate=NULL 件数: ${aliveInDb}`);

  if (errors.length > 0) {
    console.error('[reservations] 失敗行の詳細:');
    for (const e of errors) {
      console.error(`  row=${e.rowNumber} code=${e.reservationCode ?? '(なし)'} msg=${e.message}`);
    }
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('[reservations] 予期しないエラー:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
