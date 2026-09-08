import { prisma } from "../../utils/prisma";

const PARTICIPANT_SELECT = { id: true, name: true, imgId: true };

export default class ConversationRepository {
  static async findByPair(userAId: string, userBId: string) {
    return prisma.conversation.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
    });
  }

  static async create(data: {
    userAId: string;
    userBId: string;
    contextType?: string;
    contextId?: string;
    contextLabel?: string;
  }) {
    return prisma.conversation.create({ data });
  }

  static async findById(id: string) {
    return prisma.conversation.findUnique({ where: { id } });
  }

  static async findForUser(userId: string) {
    return prisma.conversation.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      include: {
        userA: { select: PARTICIPANT_SELECT },
        userB: { select: PARTICIPANT_SELECT },
        messages: {
          where: { readAt: null, senderId: { not: userId } },
          select: { id: true },
        },
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
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
      orderBy: { createdAt: "desc" },
      take: opts.limit,
    });
    return messages.reverse();
  }

  static async createMessage(data: {
    conversationId: string;
    senderId: string;
    content: string;
  }) {
    return prisma.message.create({ data });
  }

  static async touchLastMessage(conversationId: string, at: Date) {
    return prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: at },
    });
  }

  static async markRead(conversationId: string, readerId: string) {
    return prisma.message.updateMany({
      where: { conversationId, senderId: { not: readerId }, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
