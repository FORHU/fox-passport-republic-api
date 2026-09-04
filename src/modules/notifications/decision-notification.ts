import NotificationService from "./user-notification.service";

/**
 * Tells an owner that an admin decided on something they submitted.
 *
 * The two approval paths had drifted apart in a way nobody had noticed: the
 * resource-level routes (`PATCH /venues/:id/approve`) send an email, and the
 * `/admin/*` routes — the ones every screen in the app actually calls — sent
 * nothing at all. An owner whose venue was approved through the admin console
 * learned about it by going and looking.
 *
 * This closes that on the path in use. It is deliberately fire-and-forget: the
 * decision is already committed, and failing the admin's request because a
 * notification row could not be written would be the wrong trade.
 */
export function notifyDecision(input: {
  userId: string | null | undefined;
  /** Human-readable noun, as the owner would say it: "venue", "service". */
  entity: string;
  approved: boolean;
  /** Only meaningful on a rejection; ignored otherwise. */
  reason?: unknown;
}): void {
  const { userId, entity, approved } = input;
  if (!userId) return;

  const reason =
    typeof input.reason === "string" && input.reason.trim().length > 0
      ? input.reason.trim()
      : null;

  const message = approved
    ? `Your ${entity} has been approved and is now live.`
    : reason
      ? `Your ${entity} was not approved. Reason: ${reason}`
      : `Your ${entity} was not approved.`;

  void NotificationService.create({
    userId,
    type: approved ? "submission_approved" : "submission_rejected",
    title: approved ? "Submission approved" : "Submission rejected",
    message,
    metadata: { entity, approved, ...(reason ? { reason } : {}) },
  }).catch((e) => {
    console.error("Failed to write decision notification:", e);
  });
}
