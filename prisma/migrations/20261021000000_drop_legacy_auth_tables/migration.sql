-- Phase 4 of the Better Auth consolidation: sessions and social accounts live
-- in Better Auth's session/account tables. The custom refresh-token store and
-- OAuth link table are no longer read or written.
DROP TABLE IF EXISTS "refresh_tokens";
DROP TABLE IF EXISTS "oauth_accounts";
DROP TYPE IF EXISTS "OAuthProvider";
