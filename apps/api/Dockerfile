# apps/api 用 Cloud Run コンテナイメージ
# ビルドコンテキストはリポジトリルート (monorepo workspace を解決するため)
#
# 試験運用フェーズでは image サイズ削減より起動方式の堅牢性を優先し、
# ローカル `npm run start` と同じ swc-node ランタイムで .ts を直接実行する
# (@app/db / @app/shared が `main: src/index.ts` の生 TS を露出しているため)。

# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS deps
WORKDIR /app
ENV NPM_CONFIG_FUND=false
ENV NPM_CONFIG_AUDIT=false

# Prisma が要求する openssl ランタイム (bookworm-slim には未同梱)
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# package metadata だけ先に COPY して npm ci のキャッシュを効かせる
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/

RUN npm ci

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NPM_CONFIG_FUND=false
ENV NPM_CONFIG_AUDIT=false

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/package-lock.json ./package-lock.json
COPY --from=deps /app/tsconfig.base.json ./tsconfig.base.json

# workspace の package.json (npm が workspace を認識するため必要)
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json

# 実コード
COPY apps/api/src apps/api/src
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY packages/db packages/db
COPY packages/shared packages/shared

# Prisma client を生成 (DATABASE_URL は不要、スキーマだけ参照)
RUN npx prisma generate --schema packages/db/prisma/schema.prisma

# Cloud Run は PORT を環境変数で渡す。デフォルトは 8080。
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "run", "--workspace", "@app/api", "start"]
