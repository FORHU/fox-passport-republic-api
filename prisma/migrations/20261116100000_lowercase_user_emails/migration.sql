-- BUG-22 (api#167): Better Auth looks a user up by the lowercased email, so a
-- row stored with capitals can never sign in, whatever the person types.
-- Data only; no schema change.
--
-- Lowercases every stored email that has capitals, except where another account
-- already holds the lowercase form: those rows are left as they are for a
-- person to decide on. Two accounts are never merged here, and the unique
-- index on "email" is never put at risk.
UPDATE "users" AS u
SET "email" = lower(u."email"), "updatedAt" = CURRENT_TIMESTAMP
WHERE u."email" <> lower(u."email")
  AND NOT EXISTS (
    SELECT 1 FROM "users" AS other
    WHERE other."id" <> u."id" AND other."email" = lower(u."email")
  )
  -- Two mixed-case rows that differ only by case (A@x.com and a@X.com) would
  -- collide with each other; leave both.
  AND (
    SELECT count(*) FROM "users" AS twin WHERE lower(twin."email") = lower(u."email")
  ) = 1;
