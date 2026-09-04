export interface StartConversationInput {
  requesterId: string;
  otherUserId: string;
  contextType?: string;
  contextId?: string;
  contextLabel?: string;
}

export interface SendMessageInput {
  conversationId: string;
  senderId: string;
  content: string;
}
