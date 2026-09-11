import { prisma } from "../../utils/prisma";

const PARTICIPANT_SELECT = { id: true, name: true, imgId: true };

// Small preview, not the full Post shape — just enough for a chat bubble to
// render a mini card (author, snippet, first image) without pulling in
// venue/asset/service/event/review/stamp relations it'll never show.
const SHARED_POST_SELECT = {
  id: true,
  type: true,
  content: true,
  mediaUrls: true,
  author: { select: PARTICIPANT_SELECT },
};

// Just enough to render a quoted snippet above the reply — not the replied-
// to message's own sharedPost/replyTo, which would recurse.
const REPLY_TO_SELECT = {
  id: true,
  senderId: true,
  content: true,
  attachmentUrls: true,
};

const REACTIONS_SELECT = {
  select: { userId: true, emoji: true },
};

export default class ConversationRepository {
  static async findByPair(userAId: string, userBId: string) {
    return prisma.conversation.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
    });
  }

  static async create(data: {
    userAId: string;
    userBId: string;
    initiatorId: string;
    status: "pending" | "accepted";
    contextType?: string;
    contextId?: string;
    contextLabel?: string;
  }) {
    return prisma.conversation.create({ data });
  }

  // Only the recipient (never the initiator) can accept/decline a pending
  // request — the updateMany/deleteMany where-clause enforces that, so the
  // service layer just checks the resulting count.
  static async accept(conversationId: string, userId: string) {
    return prisma.conversation.updateMany({
      where: {
        id: conversationId,
        status: "pending",
        initiatorId: { not: userId },
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      data: { status: "accepted" },
    });
  }

  static async decline(conversationId: string, userId: string) {
    return prisma.conversation.deleteMany({
      where: {
        id: conversationId,
        status: "pending",
        initiatorId: { not: userId },
        OR: [{ userAId: userId }, { userBId: userId }],
      },
    });
  }

  static async findById(id: string) {
    return prisma.conversation.findUnique({
      where: { id },
      include: { participants: true },
    });
  }

  static async findForUser(userId: string) {
    return prisma.conversation.findMany({
      where: {
        OR: [
          { userAId: userId, hiddenForA: false },
          { userBId: userId, hiddenForB: false },
          { isGroup: true, participants: { some: { userId } } },
        ],
      },
      include: {
        userA: { select: PARTICIPANT_SELECT },
        userB: { select: PARTICIPANT_SELECT },
        participants: { include: { user: { select: PARTICIPANT_SELECT } } },
        // Most recent message (any sender) for the list preview — a
        // different shape than the unread count below, so it's a separate
        // relation load rather than reusing/conflicting with it.
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, senderId: true },
        },
        _count: {
          select: {
            messages: { where: { readAt: null, senderId: { not: userId } } },
          },
        },
        // Filtered to just this viewer — a missing row means "not muted,
        // not pinned" (see ConversationSettings), so the service treats an
        // empty array the same as a row of defaults.
        settings: { where: { userId } },
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    });
  }

  static async setMuted(
    conversationId: string,
    userId: string,
    muted: boolean,
  ) {
    await prisma.conversationSettings.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      create: { conversationId, userId, muted },
      update: { muted },
    });
    return ConversationRepository.findByIdWithListShape(conversationId, userId);
  }

  static async setPinned(
    conversationId: string,
    userId: string,
    pinned: boolean,
  ) {
    await prisma.conversationSettings.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      create: { conversationId, userId, pinnedAt: pinned ? new Date() : null },
      update: { pinnedAt: pinned ? new Date() : null },
    });
    return ConversationRepository.findByIdWithListShape(conversationId, userId);
  }

  // Same include shape as findForUser, scoped to one conversation — used
  // after a personal-settings change (mute/pin) so the response can be
  // formatted identically to a list row instead of a bare participants-only
  // shape (see findById, which only assertParticipant needs).
  static async findByIdWithListShape(id: string, userId: string) {
    return prisma.conversation.findUnique({
      where: { id },
      include: {
        userA: { select: PARTICIPANT_SELECT },
        userB: { select: PARTICIPANT_SELECT },
        participants: { include: { user: { select: PARTICIPANT_SELECT } } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, senderId: true },
        },
        _count: {
          select: {
            messages: { where: { readAt: null, senderId: { not: userId } } },
          },
        },
        settings: { where: { userId } },
      },
    });
  }

  // Groups start `accepted` outright — there's no 1:1-style request flow
  // for a thread three or more people are joining at once.
  static async createGroup(data: {
    creatorId: string;
    name?: string;
    participantIds: string[];
  }) {
    const allIds = [...new Set([data.creatorId, ...data.participantIds])];
    return prisma.conversation.create({
      data: {
        isGroup: true,
        name: data.name,
        initiatorId: data.creatorId,
        status: "accepted",
        participants: {
          create: allIds.map((userId) => ({ userId })),
        },
      },
      include: {
        participants: { include: { user: { select: PARTICIPANT_SELECT } } },
      },
    });
  }

  static async addParticipants(conversationId: string, userIds: string[]) {
    await prisma.conversationParticipant.createMany({
      data: userIds.map((userId) => ({ conversationId, userId })),
      skipDuplicates: true,
    });
    return prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: { include: { user: { select: PARTICIPANT_SELECT } } },
      },
    });
  }

  static async removeParticipant(conversationId: string, userId: string) {
    return prisma.conversationParticipant.deleteMany({
      where: { conversationId, userId },
    });
  }

  // `name: null` clears back to the auto-generated "member, member" label.
  static async renameGroup(conversationId: string, name: string | null) {
    return prisma.conversation.update({
      where: { id: conversationId },
      data: { name },
      include: {
        participants: { include: { user: { select: PARTICIPANT_SELECT } } },
      },
    });
  }

  static async findMessages(
    conversationId: string,
    opts: { limit: number; before?: Date },
  ) {
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        ...(opts.before ? { createdAt: { lt: opts.before } } : {}),
      },
      include: {
        sharedPost: { select: SHARED_POST_SELECT },
        replyTo: { select: REPLY_TO_SELECT },
        reactions: REACTIONS_SELECT,
      },
      orderBy: { createdAt: "desc" },
      take: opts.limit,
    });
    return messages.reverse();
  }

  static async createMessage(data: {
    conversationId: string;
    senderId: string;
    content: string;
    sharedPostId?: string;
    attachmentUrls?: string[];
    replyToId?: string;
    isForwarded?: boolean;
  }) {
    return prisma.message.create({
      data,
      include: {
        sharedPost: { select: SHARED_POST_SELECT },
        replyTo: { select: REPLY_TO_SELECT },
        reactions: REACTIONS_SELECT,
      },
    });
  }

  // Group-membership notices ("X left the group", "X added Y") — attributed
  // to the acting user as senderId, but rendered client-side as a centered
  // notice rather than a bubble (see Message.type).
  static async createSystemMessage(
    conversationId: string,
    senderId: string,
    content: string,
  ) {
    return prisma.message.create({
      data: { conversationId, senderId, content, type: "system" },
      include: {
        sharedPost: { select: SHARED_POST_SELECT },
        replyTo: { select: REPLY_TO_SELECT },
        reactions: REACTIONS_SELECT,
      },
    });
  }

  // `emoji: null` removes this user's reaction; otherwise sets/replaces it —
  // one reaction per user per message, same model as feed post reactions.
  static async setMessageReaction(
    messageId: string,
    userId: string,
    emoji: string | null,
  ) {
    if (!emoji) {
      await prisma.messageReaction.deleteMany({ where: { messageId, userId } });
    } else {
      await prisma.messageReaction.upsert({
        where: { messageId_userId: { messageId, userId } },
        create: { messageId, userId, emoji },
        update: { emoji },
      });
    }
    return prisma.messageReaction.findMany({
      where: { messageId },
      select: { userId: true, emoji: true },
    });
  }

  static async touchLastMessage(conversationId: string, at: Date) {
    return prisma.conversation.update({
      where: { id: conversationId },
      // A new message resurfaces the thread for both sides, even if either
      // one had previously deleted/hidden it — matches how a real chat app
      // brings a re-activated thread back into your list.
      data: { lastMessageAt: at, hiddenForA: false, hiddenForB: false },
    });
  }

  static async hideForUser(conversationId: string, side: "A" | "B") {
    return prisma.conversation.update({
      where: { id: conversationId },
      data: side === "A" ? { hiddenForA: true } : { hiddenForB: true },
    });
  }

  static async findMessageById(id: string) {
    return prisma.message.findUnique({ where: { id } });
  }

  // The where-clause enforces "only your own message" — same shape as
  // accept/decline enforcing "only the recipient" — so the service layer
  // just checks the resulting count instead of re-checking ownership itself.
  static async deleteMessage(id: string, senderId: string) {
    return prisma.message.deleteMany({ where: { id, senderId } });
  }

  // Same ownership enforcement as deleteMessage — `updateMany` can't return
  // the row, so a null result (nothing matched) tells the service to treat
  // it as "not found/not yours" without a second lookup either way.
  static async editMessage(id: string, senderId: string, content: string) {
    const result = await prisma.message.updateMany({
      where: { id, senderId },
      data: { content, editedAt: new Date() },
    });
    if (result.count === 0) return null;
    return prisma.message.findUnique({
      where: { id },
      include: {
        sharedPost: { select: SHARED_POST_SELECT },
        replyTo: { select: REPLY_TO_SELECT },
        reactions: REACTIONS_SELECT,
      },
    });
  }

  static async markRead(conversationId: string, readerId: string) {
    const now = new Date();
    await Promise.all([
      prisma.message.updateMany({
        where: { conversationId, senderId: { not: readerId }, readAt: null },
        data: { readAt: now },
      }),
      prisma.conversationRead.upsert({
        where: { conversationId_userId: { conversationId, userId: readerId } },
        create: { conversationId, userId: readerId, lastReadAt: now },
        update: { lastReadAt: now },
      }),
    ]);
    return { lastReadAt: now };
  }

  // One row per participant (cheap regardless of history length) — the
  // service compares each row's `lastReadAt` against a message's
  // `createdAt` to answer "has this person seen this message yet?".
  static async getReadReceipts(conversationId: string) {
    return prisma.conversationRead.findMany({
      where: { conversationId },
      select: { userId: true, lastReadAt: true },
    });
  }

  static async setGroupPhoto(conversationId: string, imgId: string | null) {
    return prisma.conversation.update({
      where: { id: conversationId },
      data: { imgId },
      include: {
        participants: { include: { user: { select: PARTICIPANT_SELECT } } },
      },
    });
  }

  // Everyone this user has a 1:1 thread with — used to scope presence
  // broadcasts to people who'd actually notice, instead of every connected
  // socket.
  static async getPartnerIds(userId: string): Promise<string[]> {
    const rows = await prisma.conversation.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      select: { userAId: true, userBId: true },
    });
    const ids = new Set<string>();
    for (const row of rows) {
      if (row.userAId && row.userAId !== userId) ids.add(row.userAId);
      if (row.userBId && row.userBId !== userId) ids.add(row.userBId);
    }
    return [...ids];
  }
}
