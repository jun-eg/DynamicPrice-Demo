-- 予約の「室数」を取り込み可能にする (issue #59)
-- 既存行は CSV 取り込み時の暗黙前提どおり 1 室として扱う。
ALTER TABLE "reservations" ADD COLUMN "roomCount" INTEGER NOT NULL DEFAULT 1;
