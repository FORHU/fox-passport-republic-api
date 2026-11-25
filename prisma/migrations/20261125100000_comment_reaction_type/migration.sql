-- api#427: comments take the same six reactions as posts.
--
-- One reaction per user per comment, like feed_post_likes. A constant
-- default is a metadata-only change in Postgres 11+, so existing rows read
-- as 'like' without a table rewrite or backfill.

-- AlterTable
ALTER TABLE "feed_post_comment_likes" ADD COLUMN "type" "ReactionType" NOT NULL DEFAULT 'like';
