-- The default FoxPassport fee for every Foxer line on an Event (#264 T3.3).
--
-- Event line fees come from `platform_fee_configs` rules with
-- transactionType = 'event_item' (category = item type, subcategory = listing
-- category). This row is the fallback for any line no narrower rule covers:
-- 5%, the value PLATFORM_FEE_PERCENT defaults to, which event pricing reads
-- today. Seeds never run on deployed databases, so it is added here.
--
-- Data only: no column, constraint or existing row is changed or removed.
-- The insert is skipped only when a default 'event_item' rule that pricing
-- would use is already in force (active, started, not ended, with a
-- percentage), so a re-run, or a rule an admin created first, is left alone.
-- An expired or future-dated default doesn't count and is not modified.
-- Nothing reads 'event_item' rules until event pricing switches to them, so
-- adding this row changes no price on its own.

INSERT INTO "platform_fee_configs" (
    "id",
    "name",
    "transactionType",
    "category",
    "subcategory",
    "percentage",
    "fixedAmount",
    "currency",
    "priority",
    "active",
    "effectiveFrom",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    'Event line default',
    'event_item',
    NULL,
    NULL,
    5.00,
    NULL,
    'PHP',
    0,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1
    FROM "platform_fee_configs"
    WHERE "transactionType" = 'event_item'
      AND "category" IS NULL
      AND ("subcategory" IS NULL OR "subcategory" = '')
      AND "active" = true
      AND "percentage" IS NOT NULL
      AND "effectiveFrom" <= CURRENT_TIMESTAMP
      AND ("effectiveUntil" IS NULL OR "effectiveUntil" > CURRENT_TIMESTAMP)
);
