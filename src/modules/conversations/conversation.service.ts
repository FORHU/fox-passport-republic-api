import { prisma } from "../../utils/prisma";
import ConversationRepository from "./conversation.repository";
import {
  CreateGroupInput,
  SendMessageInput,
  StartConversationInput,
} from "./conversation.types";
import { io } from "../../infrastructure/socket/socket.server";
import { emitToUser } from "../../infrastructure/socket/socket.utils";
import { SOCKET_EVENTS } from "../../infrastructure/socket/socket.constants";
import {
  notifyMessageRequest,
  notifyMessageRequestAccepted,
} from "../notifications/message-notification";

// Sorting the pair means the same two users always land on the same row
// regardless of who started the conversation, so the @@unique([userAId,
// userBId]) constraint can double as "get or create" instead of needing an
// OR'd lookup plus a race-prone create.
function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export default class ConversationService {
  // Whether a booking/match relationship exists between the two, independent
  // of any conversation already open between them (see canMessage below for
  // the version that also accounts for an existing thread).
  static async hasMessagingRelationship(a: string, b: string) {
    const [rule1, rule2, rule3] = await Promise.all([
      // Rule 1: citizen <-> the event organizer (Event Foxer) on a booking.
      prisma.booking.findFirst({
        where: {
          OR: [
            { userId: a, event: { organizerId: b } },
            { userId: b, event: { organizerId: a } },
          ],
        },
        select: { id: true },
      }),
      // Rule 2: Foxer <-> Foxer, matched together on an event template
      // (venue/asset/service provider matched onto an Event Foxer's template).
      prisma.eventTemplate.findFirst({
        where: {
          OR: [
            {
              ownerId: a,
              OR: [
                {
                  templateAssets: {
                    some: { matched: true, asset: { ownerId: b } },
                  },
                },
                {
                  templateServices: {
                    some: { matched: true, service: { ownerId: b } },
                  },
                },
                {
                  templateVenues: {
                    some: { matched: true, venue: { mayorId: b } },
                  },
                },
              ],
            },
            {
              ownerId: b,
              OR: [
                {
                  templateAssets: {
                    some: { matched: true, asset: { ownerId: a } },
                  },
                },
                {
                  templateServices: {
                    some: { matched: true, service: { ownerId: a } },
                  },
                },
                {
                  templateVenues: {
                    some: { matched: true, venue: { mayorId: a } },
                  },
                },
              ],
            },
          ],
        },
        select: { id: true },
      }),
      // Rule 3: Foxer <-> Foxer, co-working the same live event — the
      // organizer and one of its providers, or two different providers on
      // the same event.
      prisma.event.findFirst({
        where: {
          OR: [
            {
              organizerId: a,
              OR: [
                { venueTransactions: { some: { providerId: b } } },
                { assetTransactions: { some: { providerId: b } } },
                { serviceTransactions: { some: { providerId: b } } },
              ],
            },
            {
              organizerId: b,
              OR: [
                { venueTransactions: { some: { providerId: a } } },
                { assetTransactions: { some: { providerId: a } } },
                { serviceTransactions: { some: { providerId: a } } },
              ],
            },
            {
              AND: [
                {
                  OR: [
                    { venueTransactions: { some: { providerId: a } } },
                    { assetTransactions: { some: { providerId: a } } },
                    { serviceTransactions: { some: { providerId: a } } },
                  ],
                },
                {
                  OR: [
                    { venueTransactions: { some: { providerId: b } } },
                    { assetTransactions: { some: { providerId: b } } },
                    { serviceTransactions: { some: { providerId: b } } },
                  ],
                },
              ],
            },
          ],
        },
        select: { id: true },
      }),
    ]);

    return !!(rule1 || rule2 || rule3);
  }

  // No more gate on *creating* a conversation — anyone can message anyone.
  // Used only to decide the *starting* status: a real booking/match
  // relationship (or an existing thread) starts a new conversation already
  // `accepted`; everyone else starts a `pending` request (see
  // startConversation/sendMessage below).
  static async canMessage(a: string, b: string) {
    return a !== b;
  }

  static async startConversation(input: StartConversationInput) {
    const { requesterId, otherUserId } = input;
    if (requesterId === otherUserId) {
      throw new Error("Cannot start a conversation with yourself");
    }

    const [userAId, userBId] = canonicalPair(requesterId, otherUserId);
    const existing = await ConversationRepository.findByPair(userAId, userBId);
    if (existing) return existing;

    const hasRelationship = await ConversationService.hasMessagingRelationship(
      requesterId,
      otherUserId,
    );
    const status = hasRelationship ? "accepted" : "pending";

    const conversation = await ConversationRepository.create({
      userAId,
      userBId,
      initiatorId: requesterId,
      status,
      contextType: input.contextType,
      contextId: input.contextId,
      contextLabel: input.contextLabel,
    });

    if (status === "pending") {
      const requester = await prisma.user.findUnique({
        where: { id: requesterId },
        select: { name: true },
      });
      notifyMessageRequest({
        targetUserId: otherUserId,
        requesterId,
        requesterName: requester?.name ?? "Someone",
      });
    }

    return conversation;
  }

  // The recipient explicitly accepting a pending request.
  static async acceptRequest(conversationId: string, userId: string) {
    const conversation = await ConversationRepository.findById(conversationId);
    if (!conversation) throw new Error("Conversation not found");
    if (conversation.userAId !== userId && conversation.userBId !== userId) {
      throw new Error("Unauthorized");
    }

    const result = await ConversationRepository.accept(conversationId, userId);
    if (result.count === 0) {
      throw new Error("No pending message request from this citizen");
    }

    const accepter = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    notifyMessageRequestAccepted({
      requesterUserId: conversation.initiatorId,
      accepterId: userId,
      accepterName: accepter?.name ?? "Someone",
    });

    return { status: "accepted" as const };
  }

  // Declining deletes the request outright — same "just goes away" UX as a
  // declined follow request, rather than leaving a rejected thread around.
  static async declineRequest(conversationId: string, userId: string) {
    const result = await ConversationRepository.decline(conversationId, userId);
    if (result.count === 0) {
      throw new Error("No pending message request from this citizen");
    }
    return { status: "declined" as const };
  }

  // Shapes a raw conversation row (whatever fields the caller's query
  // happened to include) into the flat shape the frontend's `Conversation`
  // type expects — used by every path that hands a conversation back to the
  // client (the list, and both group-creation endpoints), so a freshly
  // created group comes back identically to how the list would render it
  // instead of leaking the raw participants-with-`.user` Prisma shape.
  private static formatConversation(
    c: {
      id: string;
      contextType: string | null;
      contextLabel: string | null;
      lastMessageAt: Date | null;
      createdAt: Date;
      status: string;
      initiatorId: string;
      isGroup: boolean;
      name: string | null;
      imgId?: string | null;
      userAId?: string | null;
      userBId?: string | null;
      userA?: { id: string; name: string; imgId: string | null } | null;
      userB?: { id: string; name: string; imgId: string | null } | null;
      participants?: {
        user: { id: string; name: string; imgId: string | null };
      }[];
      messages?: { content: string; senderId: string }[];
      _count?: { messages: number };
      settings?: { muted: boolean; pinnedAt: Date | null }[];
    },
    userId: string,
  ) {
    const lastMessage = c.messages?.[0];
    // A missing row (never muted/pinned) defaults to neither — see the
    // schema comment on ConversationSettings.
    const settings = c.settings?.[0];
    const base = {
      id: c.id,
      contextType: c.contextType,
      contextLabel: c.contextLabel,
      lastMessageAt: c.lastMessageAt,
      createdAt: c.createdAt,
      unreadCount: c._count?.messages ?? 0,
      status: c.status,
      // Only meaningful while status is "pending" — whether this user is
      // the one waiting on a reply/accept (they sent it) or the one being
      // asked (someone else sent it to them).
      isIncomingRequest: c.status === "pending" && c.initiatorId !== userId,
      lastMessage: lastMessage
        ? {
            content: lastMessage.content,
            isMine: lastMessage.senderId === userId,
          }
        : null,
      isMuted: settings?.muted ?? false,
      isPinned: !!settings?.pinnedAt,
      pinnedAt: settings?.pinnedAt ?? null,
    };

    if (c.isGroup) {
      const members = (c.participants ?? [])
        .map((p) => p.user)
        .filter((u) => u.id !== userId);
      return {
        ...base,
        isGroup: true as const,
        name: c.name ?? members.map((m) => m.name).join(", "),
        imgId: c.imgId ?? null,
        participants: members,
        // The creator — only they can remove other members (see
        // removeGroupMember); everyone can still rename/add freely.
        creatorId: c.initiatorId,
        otherUser: null,
      };
    }

    const otherUser = c.userAId === userId ? c.userB : c.userA;
    return { ...base, isGroup: false as const, otherUser };
  }

  static async getConversationsForUser(userId: string) {
    const conversations = await ConversationRepository.findForUser(userId);
    const formatted = conversations.map((c) =>
      ConversationService.formatConversation(c, userId),
    );
    // Pinned threads float to the top (most-recently-pinned first);
    // everything else keeps the query's lastMessageAt/createdAt order —
    // Array.sort is stable, so a plain "pinned before unpinned" comparator
    // doesn't reshuffle the unpinned tail.
    return formatted.sort((a, b) => {
      if (a.isPinned === b.isPinned) {
        if (!a.isPinned) return 0;
        return (
          new Date(b.pinnedAt!).getTime() - new Date(a.pinnedAt!).getTime()
        );
      }
      return a.isPinned ? -1 : 1;
    });
  }

  static async setMuted(
    conversationId: string,
    userId: string,
    muted: boolean,
  ) {
    await ConversationService.assertParticipant(conversationId, userId);
    const conversation = await ConversationRepository.setMuted(
      conversationId,
      userId,
      muted,
    );
    if (!conversation) throw new Error("Conversation not found");
    return ConversationService.formatConversation(conversation, userId);
  }

  static async setPinned(
    conversationId: string,
    userId: string,
    pinned: boolean,
  ) {
    await ConversationService.assertParticipant(conversationId, userId);
    const conversation = await ConversationRepository.setPinned(
      conversationId,
      userId,
      pinned,
    );
    if (!conversation) throw new Error("Conversation not found");
    return ConversationService.formatConversation(conversation, userId);
  }

  // For a group, "participant" means row-in-ConversationParticipant; for a
  // 1:1 it's still just the two fixed columns — groups never touch
  // userAId/userBId at all (see the schema comment in messaging.prisma).
  private static async assertParticipant(
    conversationId: string,
    userId: string,
  ) {
    const conversation = await ConversationRepository.findById(conversationId);
    if (!conversation) throw new Error("Conversation not found");
    const isMember = conversation.isGroup
      ? conversation.participants.some((p) => p.userId === userId)
      : conversation.userAId === userId || conversation.userBId === userId;
    if (!isMember) throw new Error("Unauthorized");
    return conversation;
  }

  // Everyone who should receive a socket emit for this conversation —
  // all participants for a group, both sides for a 1:1.
  private static getMemberIds(conversation: {
    isGroup: boolean;
    userAId: string | null;
    userBId: string | null;
    participants: { userId: string }[];
  }): string[] {
    if (conversation.isGroup) {
      return conversation.participants.map((p) => p.userId);
    }
    return [conversation.userAId, conversation.userBId].filter(
      (id): id is string => !!id,
    );
  }

  static async createGroupConversation(input: CreateGroupInput) {
    if (input.participantIds.length < 2) {
      throw new Error("A group needs at least 2 other participants");
    }
    const conversation = await ConversationRepository.createGroup(input);
    return ConversationService.formatConversation(
      conversation,
      input.creatorId,
    );
  }

  static async leaveGroup(conversationId: string, userId: string) {
    const conversation = await ConversationService.assertParticipant(
      conversationId,
      userId,
    );
    if (!conversation.isGroup) {
      throw new Error("Not a group conversation");
    }
    const leaver = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    // memberIds computed *before* removal — so the system message still
    // reaches the person who's leaving too (their own window is about to
    // close client-side either way, but everyone else's history is what
    // matters here).
    const memberIds = ConversationService.getMemberIds(conversation);

    await ConversationRepository.removeParticipant(conversationId, userId);

    const notice = await ConversationRepository.createSystemMessage(
      conversationId,
      userId,
      `${leaver?.name ?? "Someone"} left the group`,
    );
    await ConversationRepository.touchLastMessage(conversationId, new Date());

    for (const id of memberIds) {
      emitToUser(io, id, SOCKET_EVENTS.NEW_MESSAGE, notice);
      emitToUser(io, id, SOCKET_EVENTS.DATA_INVALIDATE, {
        queryKey: ["conversations"],
      });
    }
    return { success: true as const };
  }

  // Only the group's creator can remove someone else — anyone can add or
  // rename (Messenger's default), but kicking is deliberately narrower so
  // membership can't be stripped by just anyone in the thread.
  static async removeGroupMember(
    conversationId: string,
    requesterId: string,
    targetUserId: string,
  ) {
    const conversation = await ConversationService.assertParticipant(
      conversationId,
      requesterId,
    );
    if (!conversation.isGroup) {
      throw new Error("Not a group conversation");
    }
    if (conversation.initiatorId !== requesterId) {
      throw new Error("Only the group creator can remove members");
    }
    if (targetUserId === requesterId) {
      throw new Error("Use leave instead of removing yourself");
    }
    const isTargetMember = conversation.participants.some(
      (p) => p.userId === targetUserId,
    );
    if (!isTargetMember) {
      throw new Error("That person is not in this group");
    }

    const [requester, target] = await Promise.all([
      prisma.user.findUnique({
        where: { id: requesterId },
        select: { name: true },
      }),
      prisma.user.findUnique({
        where: { id: targetUserId },
        select: { name: true },
      }),
    ]);

    // memberIds computed before removal so the notice still reaches the
    // person being removed — they get a dedicated GROUP_REMOVED event too
    // (see below) to close their window client-side.
    const memberIds = ConversationService.getMemberIds(conversation);

    await ConversationRepository.removeParticipant(
      conversationId,
      targetUserId,
    );

    const notice = await ConversationRepository.createSystemMessage(
      conversationId,
      requesterId,
      `${requester?.name ?? "Someone"} removed ${target?.name ?? "a member"}`,
    );
    await ConversationRepository.touchLastMessage(conversationId, new Date());

    for (const id of memberIds) {
      emitToUser(io, id, SOCKET_EVENTS.NEW_MESSAGE, notice);
      emitToUser(io, id, SOCKET_EVENTS.DATA_INVALIDATE, {
        queryKey: ["conversations"],
      });
    }
    emitToUser(io, targetUserId, SOCKET_EVENTS.GROUP_REMOVED, {
      conversationId,
    });

    return { success: true as const };
  }

  static async renameGroup(
    conversationId: string,
    userId: string,
    name: string | null,
  ) {
    const conversation = await ConversationService.assertParticipant(
      conversationId,
      userId,
    );
    if (!conversation.isGroup) {
      throw new Error("Not a group conversation");
    }
    const updated = await ConversationRepository.renameGroup(
      conversationId,
      name,
    );
    const memberIds = ConversationService.getMemberIds(conversation);
    for (const id of memberIds) {
      emitToUser(io, id, SOCKET_EVENTS.DATA_INVALIDATE, {
        queryKey: ["conversations"],
      });
    }
    return ConversationService.formatConversation(updated, userId);
  }

  static async addParticipantsToGroup(
    conversationId: string,
    requesterId: string,
    newUserIds: string[],
  ) {
    const conversation = await ConversationService.assertParticipant(
      conversationId,
      requesterId,
    );
    if (!conversation.isGroup) {
      throw new Error("Not a group conversation");
    }
    const [requester, newUsers] = await Promise.all([
      prisma.user.findUnique({
        where: { id: requesterId },
        select: { name: true },
      }),
      prisma.user.findMany({
        where: { id: { in: newUserIds } },
        select: { name: true },
      }),
    ]);

    const updated = await ConversationRepository.addParticipants(
      conversationId,
      newUserIds,
    );
    const memberIds = updated
      ? ConversationService.getMemberIds({ ...updated, isGroup: true })
      : [];

    const names = newUsers.map((u) => u.name).join(", ");
    const notice = await ConversationRepository.createSystemMessage(
      conversationId,
      requesterId,
      names
        ? `${requester?.name ?? "Someone"} added ${names}`
        : `${requester?.name ?? "Someone"} updated the group`,
    );
    await ConversationRepository.touchLastMessage(conversationId, new Date());

    for (const id of memberIds) {
      emitToUser(io, id, SOCKET_EVENTS.NEW_MESSAGE, notice);
      emitToUser(io, id, SOCKET_EVENTS.DATA_INVALIDATE, {
        queryKey: ["conversations"],
      });
    }
    return updated
      ? ConversationService.formatConversation(updated, requesterId)
      : null;
  }

  static async getMessages(
    conversationId: string,
    userId: string,
    opts: { limit?: number; before?: Date } = {},
  ) {
    await ConversationService.assertParticipant(conversationId, userId);
    return ConversationRepository.findMessages(conversationId, {
      limit: Math.min(opts.limit ?? 30, 100),
      before: opts.before,
    });
  }

  static async sendMessage({
    conversationId,
    senderId,
    content,
    sharedPostId,
    attachmentUrls,
    replyToId,
    isForwarded,
  }: SendMessageInput) {
    const trimmed = content.trim();
    // A shared post or an attachment can stand on its own (no caption) —
    // only a plain text message needs non-empty content.
    if (!trimmed && !sharedPostId && !attachmentUrls?.length) {
      throw new Error("Message cannot be empty");
    }

    const conversation = await ConversationService.assertParticipant(
      conversationId,
      senderId,
    );

    if (sharedPostId) {
      const post = await prisma.post.findUnique({
        where: { id: sharedPostId },
        select: { id: true },
      });
      if (!post) throw new Error("Post not found");
    }

    if (replyToId) {
      const replyTarget =
        await ConversationRepository.findMessageById(replyToId);
      if (!replyTarget || replyTarget.conversationId !== conversationId) {
        throw new Error("Message not found");
      }
    }

    // The recipient replying to a pending request is an implicit accept —
    // same as Instagram/Messenger requests — so it doesn't also require a
    // separate explicit "Accept" tap for the conversation to unlock normally.
    if (
      conversation.status === "pending" &&
      conversation.initiatorId !== senderId
    ) {
      const result = await ConversationRepository.accept(
        conversationId,
        senderId,
      );
      if (result.count > 0) {
        const accepter = await prisma.user.findUnique({
          where: { id: senderId },
          select: { name: true },
        });
        notifyMessageRequestAccepted({
          requesterUserId: conversation.initiatorId,
          accepterId: senderId,
          accepterName: accepter?.name ?? "Someone",
        });
      }
    }

    const message = await ConversationRepository.createMessage({
      conversationId,
      senderId,
      content: trimmed,
      sharedPostId,
      attachmentUrls,
      replyToId,
      isForwarded,
    });
    const now = new Date();
    await ConversationRepository.touchLastMessage(conversationId, now);

    if (sharedPostId) {
      prisma.post
        .update({
          where: { id: sharedPostId },
          data: { sharesCount: { increment: 1 } },
        })
        .catch(() => {});
    }

    for (const id of ConversationService.getMemberIds(conversation)) {
      emitToUser(io, id, SOCKET_EVENTS.NEW_MESSAGE, message);
    }

    return message;
  }

  static async markRead(conversationId: string, userId: string) {
    const conversation = await ConversationService.assertParticipant(
      conversationId,
      userId,
    );
    const { lastReadAt } = await ConversationRepository.markRead(
      conversationId,
      userId,
    );

    const otherMemberIds = ConversationService.getMemberIds(
      conversation,
    ).filter((id) => id !== userId);
    for (const id of otherMemberIds) {
      emitToUser(io, id, SOCKET_EVENTS.READ_RECEIPT, {
        conversationId,
        userId,
        lastReadAt,
      });
    }
    return { lastReadAt };
  }

  // Read receipts scoped to a conversation — one row per participant who
  // has ever read it. The frontend compares each row's `lastReadAt`
  // against a message's `createdAt` to know who's seen it.
  static async getReadReceipts(conversationId: string, userId: string) {
    await ConversationService.assertParticipant(conversationId, userId);
    return ConversationRepository.getReadReceipts(conversationId);
  }

  static async editMessage(
    conversationId: string,
    messageId: string,
    userId: string,
    content: string,
  ) {
    const conversation = await ConversationService.assertParticipant(
      conversationId,
      userId,
    );

    const existing = await ConversationRepository.findMessageById(messageId);
    if (!existing || existing.conversationId !== conversationId) {
      throw new Error("Message not found");
    }
    if (existing.senderId !== userId) {
      throw new Error("Unauthorized");
    }
    if (existing.type === "system") {
      throw new Error("Cannot edit a system message");
    }

    const trimmed = content.trim();
    if (!trimmed) throw new Error("Message cannot be empty");

    const updated = await ConversationRepository.editMessage(
      messageId,
      userId,
      trimmed,
    );
    if (!updated) throw new Error("Message not found");

    for (const id of ConversationService.getMemberIds(conversation)) {
      emitToUser(io, id, SOCKET_EVENTS.MESSAGE_EDITED, updated);
    }
    return updated;
  }

  static async setGroupPhoto(
    conversationId: string,
    userId: string,
    imgId: string | null,
  ) {
    const conversation = await ConversationService.assertParticipant(
      conversationId,
      userId,
    );
    if (!conversation.isGroup) {
      throw new Error("Not a group conversation");
    }
    const updated = await ConversationRepository.setGroupPhoto(
      conversationId,
      imgId,
    );
    for (const id of ConversationService.getMemberIds(conversation)) {
      emitToUser(io, id, SOCKET_EVENTS.DATA_INVALIDATE, {
        queryKey: ["conversations"],
      });
    }
    return ConversationService.formatConversation(updated, userId);
  }

  // Used by the socket gateway to scope presence broadcasts (see
  // socket.gateway.ts) — everyone this user has a 1:1 thread with.
  static async getPartnerIds(userId: string) {
    return ConversationRepository.getPartnerIds(userId);
  }

  // Used by the socket gateway to relay a "typing" signal to the other
  // participant(s) — throws (caught by the gateway) if userId isn't
  // actually a participant, same guard assertParticipant enforces
  // elsewhere. Returns everyone else in the thread (plural for groups).
  static async getRecipientIds(conversationId: string, userId: string) {
    const conversation = await ConversationService.assertParticipant(
      conversationId,
      userId,
    );
    return ConversationService.getMemberIds(conversation).filter(
      (id) => id !== userId,
    );
  }

  // Per-user "Delete Chat" — drops the thread from this user's list only.
  // See the schema comment on hiddenForA/hiddenForB for why it isn't a hard
  // delete: the other side's view and the message history are untouched.
  static async deleteChatForUser(conversationId: string, userId: string) {
    const conversation = await ConversationService.assertParticipant(
      conversationId,
      userId,
    );
    const side = conversation.userAId === userId ? "A" : "B";
    await ConversationRepository.hideForUser(conversationId, side);
    return { success: true as const };
  }

  // Hard delete, both sides — same "unsend" semantics as Messenger, not a
  // per-user hide. Only the sender may delete their own message.
  static async deleteMessage(
    conversationId: string,
    messageId: string,
    userId: string,
  ) {
    const conversation = await ConversationService.assertParticipant(
      conversationId,
      userId,
    );

    const message = await ConversationRepository.findMessageById(messageId);
    if (!message || message.conversationId !== conversationId) {
      throw new Error("Message not found");
    }
    if (message.senderId !== userId) {
      throw new Error("Unauthorized");
    }

    const result = await ConversationRepository.deleteMessage(
      messageId,
      userId,
    );
    if (result.count === 0) throw new Error("Message not found");

    const payload = { conversationId, messageId };
    for (const id of ConversationService.getMemberIds(conversation)) {
      emitToUser(io, id, SOCKET_EVENTS.MESSAGE_DELETED, payload);
    }

    return { success: true as const };
  }

  static async reactToMessage(
    conversationId: string,
    messageId: string,
    userId: string,
    emoji: string | null,
  ) {
    const conversation = await ConversationService.assertParticipant(
      conversationId,
      userId,
    );

    const message = await ConversationRepository.findMessageById(messageId);
    if (!message || message.conversationId !== conversationId) {
      throw new Error("Message not found");
    }

    const reactions = await ConversationRepository.setMessageReaction(
      messageId,
      userId,
      emoji,
    );

    const payload = { conversationId, messageId, reactions };
    for (const id of ConversationService.getMemberIds(conversation)) {
      emitToUser(io, id, SOCKET_EVENTS.MESSAGE_REACTION, payload);
    }

    return { reactions };
  }
}
