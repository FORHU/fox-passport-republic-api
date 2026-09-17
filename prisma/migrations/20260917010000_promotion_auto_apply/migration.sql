-- Auto-apply promotions: no code required, matched automatically at
-- checkout against the promotion's own scope.

ALTER TABLE "promotions"
  ADD COLUMN "autoApply" BOOLEAN NOT NULL DEFAULT false;
