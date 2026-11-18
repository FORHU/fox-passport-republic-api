-- Rewards revision (RR-1 D2, api#298): Foxers earn Tokens only as citizens.
-- Set the Foxer-only reward rules inactive. Rows are kept, not deleted, and
-- RewardService.grant pays nothing for an inactive rule. Data only; no schema change.
UPDATE "reward_rules"
SET "active" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "action" IN ('five_star_review');
