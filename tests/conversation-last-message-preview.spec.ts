import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The inbox preview of a thread's last message (app#385). A post or file sent
 * without a caption has empty content, so the list also says whether the
 * last message carried a post or attachments, for "Sent a post".
 */

const repo = vi.hoisted(() => ({ findForUser: vi.fn() }));
vi.mock("../src/modules/conversations/conversation.repository", () => ({
  default: repo,
}));
vi.mock("../src/utils/prisma", () => ({ prisma: {} }));
vi.mock("../src/infrastructure/socket/socket.utils", () => ({
  emitToUser: vi.fn(),
}));
vi.mock("../src/infrastructure/socket/socket.server", () => ({ io: {} }));
vi.mock("../src/modules/notifications/message-notification", () => ({
  notifyMessageRequest: vi.fn(),
  notifyMessageRequestAccepted: vi.fn(),
  notifyGroupMention: vi.fn(),
}));
vi.mock("../src/modules/block/block.repository", () => ({ default: {} }));

import ConversationService from "../src/modules/conversations/conversation.service";

const ana = { id: "ana", name: "Ana", imgId: null };
const ben = { id: "ben", name: "Ben", imgId: null };

const thread = (message: Record<string, unknown>) => ({
  id: "c1",
  contextType: null,
  contextLabel: null,
  lastMessageAt: new Date(),
  createdAt: new Date(),
  status: "accepted",
  initiatorId: "ana",
  isGroup: false,
  name: null,
  userAId: "ana",
  userBId: "ben",
  userA: ana,
  userB: ben,
  participants: [],
  messages: [message],
  _count: { messages: 0 },
  settings: [],
});

beforeEach(() => vi.clearAllMocks());

describe("the inbox preview of the last message", () => {
  it("flags a post sent without a caption", async () => {
    repo.findForUser.mockResolvedValue([
      thread({
        content: "",
        senderId: "ana",
        sharedPostId: "p1",
        attachmentUrls: [],
      }),
    ]);

    const [c] = await ConversationService.getConversationsForUser("ben");

    expect(c.lastMessage).toEqual({
      content: "",
      isMine: false,
      hasSharedPost: true,
      hasAttachments: false,
    });
  });

  it("flags attachments, and neither flag on plain text", async () => {
    repo.findForUser.mockResolvedValue([
      thread({
        content: "",
        senderId: "ben",
        sharedPostId: null,
        attachmentUrls: ["a.jpg"],
      }),
    ]);
    const [withFile] = await ConversationService.getConversationsForUser("ben");
    expect(withFile.lastMessage).toMatchObject({
      isMine: true,
      hasSharedPost: false,
      hasAttachments: true,
    });

    repo.findForUser.mockResolvedValue([
      thread({
        content: "hi",
        senderId: "ana",
        sharedPostId: null,
        attachmentUrls: [],
      }),
    ]);
    const [text] = await ConversationService.getConversationsForUser("ben");
    expect(text.lastMessage).toMatchObject({
      content: "hi",
      hasSharedPost: false,
      hasAttachments: false,
    });
  });
});
