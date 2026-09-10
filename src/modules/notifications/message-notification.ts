import NotificationService from "./user-notification.service";

/**
 * Fire-and-forget, same shape as notifyDecision: the conversation row is
 * already committed, so a notification failure must not fail the request.
 */
function fireAndForget(
  input: Parameters<typeof NotificationService.create>[0],
): void {
  void NotificationService.create(input).catch((e) => {
    console.error("Failed to write message notification:", e);
  });
}

export function notifyMessageRequest(input: {
  targetUserId: string;
  requesterId: string;
  requesterName: string;
}): void {
  fireAndForget({
    userId: input.targetUserId,
    type: "message_request",
    title: "New message request",
    message: `${input.requesterName} sent you a message request.`,
    metadata: {
      link: `/messages?userId=${input.requesterId}`,
      requesterId: input.requesterId,
    },
  });
}

export function notifyMessageRequestAccepted(input: {
  requesterUserId: string;
  accepterId: string;
  accepterName: string;
}): void {
  fireAndForget({
    userId: input.requesterUserId,
    type: "message_request_accepted",
    title: "Message request accepted",
    message: `${input.accepterName} accepted your message request.`,
    metadata: {
      link: `/messages?userId=${input.accepterId}`,
      accepterId: input.accepterId,
    },
  });
}
