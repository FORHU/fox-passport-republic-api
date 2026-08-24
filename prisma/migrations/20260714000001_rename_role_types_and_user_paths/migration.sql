-- Rename RoleType enum values
ALTER TYPE "RoleType" RENAME VALUE 'mayor' TO 'venueFoxer';
ALTER TYPE "RoleType" RENAME VALUE 'host' TO 'eventFoxer';
ALTER TYPE "RoleType" RENAME VALUE 'foxerAsset' TO 'gearFoxer';
ALTER TYPE "RoleType" RENAME VALUE 'foxerService' TO 'serviceFoxer';

-- Rename UserPath enum values
-- 'foxer' becomes 'gearFoxer'; 'serviceFoxer' is added as a new value
ALTER TYPE "UserPath" RENAME VALUE 'foxer' TO 'gearFoxer';
ALTER TYPE "UserPath" RENAME VALUE 'host' TO 'eventFoxer';
ALTER TYPE "UserPath" RENAME VALUE 'mayor' TO 'venueFoxer';
ALTER TYPE "UserPath" ADD VALUE IF NOT EXISTS 'serviceFoxer';

-- Rename application tables
ALTER TABLE "MayorApplication" RENAME TO "VenueFoxerApplication";
ALTER TABLE "FoxerAssetApplication" RENAME TO "GearFoxerApplication";
ALTER TABLE "FoxerServiceApplication" RENAME TO "ServiceFoxerApplication";
ALTER TABLE "HostApplication" RENAME TO "EventFoxerApplication";
