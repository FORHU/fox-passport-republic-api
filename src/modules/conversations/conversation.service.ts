import { prisma } from "../../utils/prisma";
import ConversationRepository from "./conversation.repository";
import { SendMessageInput, StartConversationInput } from "./conversation.types";
import { io } from "../../infrastructure/socket/socket.server";
import { emitToUser } from "../../infrastructure/socket/socket.utils";
import { SOCKET_EVENTS } from "../../infrastructure/socket/socket.constants";

// Sorting the pair means the same two users always land on the same row
// regardless of who started the conversation, so the @@unique([userAId,
// userBId]) constraint can double as "get or create" instead of needing an
// OR'd lookup plus a race-prone create.
function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export default class ConversationService {
  // Gate on *creating* a conversation, not on every message — once a thread
  // exists both sides can keep using it even if the underlying booking/match
  // that justified it later changes state (gets cancelled, etc.), same as
  // any normal chat app.
  static async assertCanMessage(a: string, b: string) {
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
                { templateAssets: { some: { matched: true, asset: { ownerId: b } } } },
                { templateServices: { some: { matched: true, service: { ownerId: b } } } },
                { templateVenues: { some: { matched: true, venue: { mayorId: b } } } },
              ],
            },
            {
              ownerId: b,
              OR: [
                { templateAssets: { some: { matched: true, asset: { ownerId: a } } } },
                { templateServices: { some: { matched: true, service: { ownerId: a } } } },
                { templateVenues: { some: { matched: true, venue: { mayorId: a } } } },
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

    if (!rule1 && !rule2 && !rule3) {
      throw new Error("Unauthorized");
    }
  }

  static async startConversation(input: StartConversationInput) {
    const { requesterId, otherUserId } = input;
    if (requesterId === otherUserId) {
      throw new Error("Cannot start a conversation with yourself");
    }

    const [userAId, userBId] = canonicalPair(requesterId, otherUserId);
    const existing = await ConversationRepository.findByPair(userAId, userBId);
    if (existing) return existing;

    await ConversationService.assertCanMessage(requesterId, otherUserId);

    return ConversationRepository.create({
      userAId,
      userBId,
      contextType: input.contextType,
      contextId: input.contextId,
      contextLabel: input.contextLabel,
    });
  }

  static async getConversationsForUser(userId: string) {
    const conversations = await ConversationRepository.findForUser(userId);
    return conversations.map((c) => {
      const otherUser = c.userAId === userId ? c.userB : c.userA;
      return {
        id: c.id,
        otherUser,
        contextType: c.contextType,
        contextLabel: c.contextLabel,
        lastMessageAt: c.lastMessageAt,
        createdAt: c.createdAt,
        unreadCount: c.messages.length,
      };
    });
  }

  private static async assertParticipant(conversationId: string, userId: string) {
    const conversation = await ConversationRepository.findById(conversationId);
    if (!conversation) throw new Error("Conversation not found");
    if (conversation.userAId !== userId && conversation.userBId !== userId) {
      throw new Error("Unauthorized");
    }
    return conversation;
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

  static async sendMessage({ conversationId, senderId, content }: SendMessageInput) {
    const trimmed = content.trim();
    if (!trimmed) throw new Error("Message cannot be empty");

    const conversation = await ConversationService.assertParticipant(
      conversationId,
      senderId,
    );

    const message = await ConversationRepository.createMessage({
      conversationId,
      senderId,
      content: trimmed,
    });
    const now = new Date();
    await ConversationRepository.touchLastMessage(conversationId, now);

    const recipientId =
      conversation.userAId === senderId ? conversation.userBId : conversation.userAId;
    emitToUser(io, recipientId, SOCKET_EVENTS.NEW_MESSAGE, message);
    emitToUser(io, senderId, SOCKET_EVENTS.NEW_MESSAGE, message);

    return message;
  }

  static async markRead(conversationId: string, userId: string) {
    await ConversationService.assertParticipant(conversationId, userId);
    return ConversationRepository.markRead(conversationId, userId);
  }
}
