-- Refresh-token rotation.
--
-- Purely additive: two nullable columns on an existing table. No existing
-- column is altered and no row is rewritten, so this is safe to apply to an
-- environment with real sessions in it.
--
-- `rotatedAt` is set only when a token is exchanged for a successor.
-- `revokedAt` without `rotatedAt` therefore still means "logout or password
-- change", which is what lets reuse detection tell an ordinary dead token
-- apart from a copy of a rotated one.
--
-- Tokens issued before this migration have both columns NULL. Presenting one
-- after it has been revoked reads as an ordinary revoked token, not as theft —
-- the conservative direction.

ALTER TABLE "RefreshToken" ADD COLUMN "rotatedAt" TIMESTAMP(3);
ALTER TABLE "RefreshToken" ADD COLUMN "replacedByJti" TEXT;
