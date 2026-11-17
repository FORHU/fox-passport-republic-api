-- RR-8 (api#303): admin overrides for reward settings that were environment
-- variables. One row per setting key; no row means the built-in default. A new
-- table only: nothing existing is changed, so it is safe to apply before or
-- after the code that reads it (without the table the code falls back to the
-- defaults).

-- CreateTable
CREATE TABLE "reward_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_settings_pkey" PRIMARY KEY ("key")
);
