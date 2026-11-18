-- Daily login (RR-7, api#302): 15 Tokens once per Manila day, as a reward rule
-- so the amount can be changed without a deploy. The rule's daily cap of 1 is a
-- second guard behind the per-day idempotency key. Data only; no schema change.
INSERT INTO "reward_rules" ("id", "action", "xp", "coins", "dailyCap", "onceOnly", "active", "updatedAt")
VALUES ('rule-daily-login', 'daily_login', 0, 15, 1, false, true, CURRENT_TIMESTAMP)
ON CONFLICT ("action") DO NOTHING;
