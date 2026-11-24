/**
 * Where a Republic (`feed:*`) notification leads: the post, and the comment or
 * reply inside it. Clients open `postId` and, when `commentId` is set, scroll to
 * that comment; for a reply, `parentCommentId` is the top-level comment it sits
 * under (replies are one level deep, see `PostComment.parentId`).
 *
 * Stored metadata keeps its older keys (`postId`, `commentId`, which the mobile
 * app already reads); `targetType` and `parentCommentId` are added beside them.
 * Rows written before those existed resolve the same way, from the database.
 */

export type FeedTargetType = "post" | "comment" | "reply";

export interface FeedNotificationTarget {
  type: FeedTargetType;
  postId: string;
  /** The comment or reply itself; null when the notification is about the post. */
  commentId: string | null;
  /** The top-level comment a reply answers; null unless `type` is "reply". */
  parentCommentId: string | null;
  /** False once the post, or the comment, has been deleted. */
  available: boolean;
}

export interface FeedTargetRef {
  postId: string;
  commentId?: string | null;
  parentCommentId?: string | null;
}

function targetTypeOf(
  commentId: string | null,
  parentCommentId: string | null,
): FeedTargetType {
  if (commentId && parentCommentId) return "reply";
  return commentId ? "comment" : "post";
}

/** The routing keys a `feed:*` notification's metadata is written with. */
export function feedTargetMetadata(ref: FeedTargetRef) {
  const commentId = ref.commentId || null;
  const parentCommentId = (commentId && ref.parentCommentId) || null;
  return {
    postId: ref.postId,
    commentId,
    parentCommentId,
    targetType: targetTypeOf(commentId, parentCommentId),
  };
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The post and comment ids a stored notification references, or null when it
 * is not a feed notification. `postId` can be null: `feed:comment_like` rows
 * written before it was stored only have the comment.
 */
export function feedRefIds(
  type: string,
  metadata: unknown,
): { postId: string | null; commentId: string | null } | null {
  if (!type.startsWith("feed:")) return null;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const m = metadata as Record<string, unknown>;
  return { postId: str(m.postId), commentId: str(m.commentId) };
}

/** What still exists, looked up once for a page of notifications. */
export interface FeedTargetLookup {
  postIds: Set<string>;
  comments: Map<string, { postId: string; parentId: string | null }>;
}

/**
 * The target a notification points at. Without `lookup` (a notification that
 * was just written) the stored ids are trusted and `available` is true. With
 * it, a deleted post or comment makes `available` false, and the comment's own
 * row supplies its post and parent when the metadata lacks them. Null when
 * there is no post to open at all.
 */
export function resolveFeedTarget(
  type: string,
  metadata: unknown,
  lookup?: FeedTargetLookup,
): FeedNotificationTarget | null {
  const ids = feedRefIds(type, metadata);
  if (!ids) return null;
  const m = metadata as Record<string, unknown>;

  const comment = ids.commentId
    ? lookup?.comments.get(ids.commentId)
    : undefined;
  const postId = ids.postId ?? comment?.postId ?? null;
  if (!postId) return null;

  const parentCommentId = ids.commentId
    ? (comment ? comment.parentId : str(m.parentCommentId)) || null
    : null;

  const available = lookup
    ? lookup.postIds.has(postId) && (!ids.commentId || comment !== undefined)
    : true;

  return {
    type: targetTypeOf(ids.commentId, parentCommentId),
    postId,
    commentId: ids.commentId,
    parentCommentId,
    available,
  };
}
