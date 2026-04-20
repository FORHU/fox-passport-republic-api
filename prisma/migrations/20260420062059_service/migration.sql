-- AlterTable
ALTER TABLE "services" ALTER COLUMN "city" SET DEFAULT 'Unknown City',
ALTER COLUMN "country" SET DEFAULT 'Unknown Country',
ALTER COLUMN "tags" DROP DEFAULT;
