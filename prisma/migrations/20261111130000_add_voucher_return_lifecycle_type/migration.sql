-- Rewards revision (RR-1 D4, api#298): a Token voucher that expires completely
-- unused returns its Tokens, recorded as a new append-only lifecycle row.
-- Adds an enum value only; no table or data change.
ALTER TYPE "RewardLifecycleType" ADD VALUE IF NOT EXISTS 'VOUCHER_RETURN';
