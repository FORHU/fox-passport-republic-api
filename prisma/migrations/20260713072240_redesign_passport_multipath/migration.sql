/*
  Warnings:

  - You are about to drop the column `achievements` on the `Passport` table. All the data in the column will be lost.
  - You are about to drop the column `level` on the `Passport` table. All the data in the column will be lost.
  - You are about to drop the column `totalMileage` on the `Passport` table. All the data in the column will be lost.
  - You are about to drop the column `totalStamps` on the `Passport` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "UserPath" AS ENUM ('user', 'foxer', 'host', 'mayor', 'investor');

-- CreateEnum
CREATE TYPE "BadgeRarity" AS ENUM ('Common', 'Uncommon', 'Rare', 'Epic', 'Legendary');

-- AlterTable
ALTER TABLE "Passport" DROP COLUMN "achievements",
DROP COLUMN "level",
DROP COLUMN "totalMileage",
DROP COLUMN "totalStamps";

-- CreateTable
CREATE TABLE "PassportPath" (
    "id" TEXT NOT NULL,
    "passportId" TEXT NOT NULL,
    "path" "UserPath" NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "currentXP" INTEGER NOT NULL DEFAULT 0,
    "totalXP" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PassportPath_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "rarity" "BadgeRarity" NOT NULL,
    "path" "UserPath",
    "criteria" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBadge" (
    "id" TEXT NOT NULL,
    "passportId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassportStamp" (
    "id" TEXT NOT NULL,
    "passportId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "xpEarned" INTEGER NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PassportStamp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PassportPath_passportId_path_key" ON "PassportPath"("passportId", "path");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_name_key" ON "Badge"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserBadge_passportId_badgeId_key" ON "UserBadge"("passportId", "badgeId");

-- CreateIndex
CREATE UNIQUE INDEX "PassportStamp_bookingId_key" ON "PassportStamp"("bookingId");

-- AddForeignKey
ALTER TABLE "PassportPath" ADD CONSTRAINT "PassportPath_passportId_fkey" FOREIGN KEY ("passportId") REFERENCES "Passport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_passportId_fkey" FOREIGN KEY ("passportId") REFERENCES "Passport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassportStamp" ADD CONSTRAINT "PassportStamp_passportId_fkey" FOREIGN KEY ("passportId") REFERENCES "Passport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassportStamp" ADD CONSTRAINT "PassportStamp_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
