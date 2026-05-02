// マスターシード: RoomType / Plan / BasePrice / 初期 ADMIN ユーザーを投入する。
// 冪等: 何度実行しても重複しない(unique key で upsert)。
// 根拠: docs/architecture/03-data-model.md / docs/runbooks/local-development.md §5-1 / ADR-0004

import 'dotenv/config';
import { Prisma, prisma } from '@app/db';
import { ROOM_TYPES, PLANS, BASE_PRICES } from './master-data';

async function upsertRoomTypes(): Promise<void> {
  // 既存レコードは触らない: Web 管理画面 (/admin/room-types) から ADMIN が
  // inventoryCount を編集できるため、毎デプロイで巻き戻さない (issue #59)。
  // 初回 seed の値が無いと稼働率の分母が 0 になるので create だけは保証する。
  for (const rt of ROOM_TYPES) {
    await prisma.roomType.upsert({
      where: { code: rt.code },
      update: {},
      create: {
        code: rt.code,
        name: rt.name,
        capacity: rt.capacity,
        inventoryCount: rt.inventoryCount,
      },
    });
  }
  console.log(`[master] RoomType ensured: ${ROOM_TYPES.length}`);
}

async function upsertPlans(): Promise<void> {
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: { name: plan.name, mealType: plan.mealType },
      create: { code: plan.code, name: plan.name, mealType: plan.mealType },
    });
  }
  console.log(`[master] Plan upserted: ${PLANS.length}`);
}

async function upsertBasePrices(): Promise<void> {
  for (const bp of BASE_PRICES) {
    const roomType = await prisma.roomType.findUniqueOrThrow({ where: { code: bp.roomTypeCode } });
    const plan = await prisma.plan.findUniqueOrThrow({ where: { code: bp.planCode } });
    const effectiveFrom = new Date(`${bp.effectiveFrom}T00:00:00Z`);
    const effectiveTo = bp.effectiveTo ? new Date(`${bp.effectiveTo}T00:00:00Z`) : null;

    await prisma.basePrice.upsert({
      where: {
        roomTypeId_planId_effectiveFrom: {
          roomTypeId: roomType.id,
          planId: plan.id,
          effectiveFrom,
        },
      },
      update: {
        amount: new Prisma.Decimal(bp.amount),
        priceMin: new Prisma.Decimal(bp.priceMin),
        priceMax: new Prisma.Decimal(bp.priceMax),
        effectiveTo,
      },
      create: {
        roomTypeId: roomType.id,
        planId: plan.id,
        amount: new Prisma.Decimal(bp.amount),
        priceMin: new Prisma.Decimal(bp.priceMin),
        priceMax: new Prisma.Decimal(bp.priceMax),
        effectiveFrom,
        effectiveTo,
      },
    });
  }
  console.log(`[master] BasePrice upserted: ${BASE_PRICES.length}`);
}

async function upsertAdminUser(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  if (!email) {
    throw new Error('SEED_ADMIN_EMAIL が未設定です。.env を確認してください。');
  }

  // 既存ユーザーは触らない: 運用で role/status を変えても毎デプロイで巻き戻さないため。
  // この seed は「初期 ADMIN がいない状態で 1 件作る」ことだけを保証する。
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, role: 'ADMIN', status: 'ACTIVE' },
  });
  console.log(`[master] ADMIN user ensured: ${email}`);
}

async function main(): Promise<void> {
  console.log('[master] start');
  await upsertRoomTypes();
  await upsertPlans();
  await upsertBasePrices();
  await upsertAdminUser();
  console.log('[master] done');
}

main()
  .catch((err) => {
    console.error('[master] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
