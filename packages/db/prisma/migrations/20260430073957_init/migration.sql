-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "CoefficientType" AS ENUM ('SEASON', 'DAY_OF_WEEK', 'LEAD_TIME');

-- CreateTable
CREATE TABLE "room_types" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "inventoryCount" INTEGER NOT NULL,

    CONSTRAINT "room_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mealType" TEXT,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" SERIAL NOT NULL,
    "reservationCode" TEXT,
    "bookedDate" DATE NOT NULL,
    "checkInDate" DATE NOT NULL,
    "checkOutDate" DATE NOT NULL,
    "nights" INTEGER NOT NULL,
    "bookingChannel" TEXT,
    "roomTypeId" INTEGER NOT NULL,
    "planId" INTEGER NOT NULL,
    "adults" INTEGER NOT NULL,
    "children" INTEGER NOT NULL,
    "infants" INTEGER NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "adultUnitPrice" DECIMAL(12,2),
    "childUnitPrice" DECIMAL(12,2),
    "infantUnitPrice" DECIMAL(12,2),
    "cancelDate" DATE,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "base_prices" (
    "id" SERIAL NOT NULL,
    "roomTypeId" INTEGER NOT NULL,
    "planId" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "priceMin" DECIMAL(12,2) NOT NULL,
    "priceMax" DECIMAL(12,2) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,

    CONSTRAINT "base_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_coefficients" (
    "id" SERIAL NOT NULL,
    "type" "CoefficientType" NOT NULL,
    "key" TEXT NOT NULL,
    "value" DECIMAL(6,4) NOT NULL,
    "computedAt" TIMESTAMPTZ(6) NOT NULL,
    "source" TEXT,

    CONSTRAINT "price_coefficients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMPTZ(6),
    "invitedById" INTEGER,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "invitedById" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "room_types_code_key" ON "room_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE INDEX "reservations_checkInDate_idx" ON "reservations"("checkInDate");

-- CreateIndex
CREATE INDEX "reservations_bookedDate_idx" ON "reservations"("bookedDate");

-- CreateIndex
CREATE INDEX "reservations_roomTypeId_planId_checkInDate_idx" ON "reservations"("roomTypeId", "planId", "checkInDate");

-- CreateIndex
CREATE UNIQUE INDEX "base_prices_roomTypeId_planId_effectiveFrom_key" ON "base_prices"("roomTypeId", "planId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "price_coefficients_type_key_idx" ON "price_coefficients"("type", "key");

-- CreateIndex
CREATE UNIQUE INDEX "price_coefficients_type_key_computedAt_key" ON "price_coefficients"("type", "key", "computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "room_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_prices" ADD CONSTRAINT "base_prices_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "room_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_prices" ADD CONSTRAINT "base_prices_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint: priceMin <= priceMax (ADR-0008)
ALTER TABLE "base_prices" ADD CONSTRAINT "base_price_price_min_lte_max" CHECK ("priceMin" <= "priceMax");
