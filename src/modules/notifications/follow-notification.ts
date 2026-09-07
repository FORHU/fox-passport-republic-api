import NotificationService from "./user-notification.service";

/**
 * Fire-and-forget, same shape as notifyDecision: the follow row is already
 * committed, so a notification failure must not fail the request.
 */
function fireAndForget(
  input: Parameters<typeof NotificationService.create>[0],
): void {
  void NotificationService.create(input).catch((e) => {
    console.error("Failed to write follow notification:", e);
  });
}

export function notifyFollowRequest(input: {
  targetUserId: string;
  requesterId: string;
  requesterName: string;
}): void {
  fireAndForget({
    userId: input.targetUserId,
    type: "follow_request",
    title: "New follow request",
    message: `${input.requesterName} wants to follow you.`,
    metadata: { link: `/user/${input.requesterId}`, requesterId: input.requesterId },
  });
}

export function notifyNewFollower(input: {
  targetUserId: string;
  followerId: string;
  followerName: string;
}): void {
  fireAndForget({
    userId: input.targetUserId,
    type: "new_follower",
    title: "New follower",
    message: `${input.followerName} started following you.`,
    metadata: { link: `/user/${input.followerId}`, followerId: input.followerId },
  });
}

export function notifyFollowAccepted(input: {
  requesterUserId: string;
  accepterId: string;
  accepterName: string;
}): void {
  fireAndForget({
    userId: input.requesterUserId,
    type: "follow_request_accepted",
    title: "Follow request accepted",
    message: `${input.accepterName} accepted your follow request.`,
    metadata: { link: `/user/${input.accepterId}`, accepterId: input.accepterId },
  });
}
