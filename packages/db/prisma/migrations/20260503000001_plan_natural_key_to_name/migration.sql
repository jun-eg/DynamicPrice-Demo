-- Plan の自然キーを商品プランコードから商品プラン名称に切り替える (issue #55, #56 / ADR-0010)。
-- 元 CSV では同一名称が複数コードに散る (#55) 一方、同一コードに複数名称が同居する (#56) という
-- 双方向の問題がある。code を捨てて name で集約することで業務単位に揃える。
--
-- 移行手順:
--   1. 同 name の plans 行のうち、最小 id 以外を参照する reservations / base_prices を最小 id に再リンク
--   2. 重複 plan 行を削除
--   3. code 列を削除
--   4. name に UNIQUE 制約を追加

-- 1a. reservations.planId を最小 id に張り替え
UPDATE "reservations"
SET "planId" = canonical.id
FROM (SELECT name, MIN(id) AS id FROM "plans" GROUP BY name) AS canonical, "plans" AS p
WHERE p.name = canonical.name
  AND p.id <> canonical.id
  AND "reservations"."planId" = p.id;

-- 1b. base_prices.planId を最小 id に張り替え
UPDATE "base_prices"
SET "planId" = canonical.id
FROM (SELECT name, MIN(id) AS id FROM "plans" GROUP BY name) AS canonical, "plans" AS p
WHERE p.name = canonical.name
  AND p.id <> canonical.id
  AND "base_prices"."planId" = p.id;

-- 2. 重複 plan 行を削除
DELETE FROM "plans"
WHERE id NOT IN (SELECT MIN(id) FROM "plans" GROUP BY name);

-- 3. code 列の UNIQUE インデックスを削除してから列を落とす
DROP INDEX IF EXISTS "plans_code_key";
ALTER TABLE "plans" DROP COLUMN "code";

-- 4. name に UNIQUE 制約を追加
CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");
