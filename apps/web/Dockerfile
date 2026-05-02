# apps/web 用 Cloud Run コンテナイメージ
# ビルドコンテキストはリポジトリルート (monorepo workspace を解決するため)

# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS deps
WORKDIR /app
ENV NPM_CONFIG_FUND=false
ENV NPM_CONFIG_AUDIT=false

# Prisma が要求する openssl ランタイム (bookworm-slim には未同梱)
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/

RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NPM_CONFIG_FUND=false
ENV NPM_CONFIG_AUDIT=false

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/package-lock.json ./package-lock.json
COPY --from=deps /app/tsconfig.base.json ./tsconfig.base.json

COPY apps/api/package.json apps/api/package.json
COPY apps/web apps/web
COPY packages/db packages/db
COPY packages/shared packages/shared

# Next.js の build には Prisma client 型が必要 (web は @app/db を transpile)
RUN npx prisma generate --schema packages/db/prisma/schema.prisma
RUN npm run build --workspace @app/web

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NPM_CONFIG_FUND=false
ENV NPM_CONFIG_AUDIT=false

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/apps/web ./apps/web
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/packages/db ./packages/db
COPY --from=builder /app/packages/shared ./packages/shared

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["npm", "run", "--workspace", "@app/web", "start"]
