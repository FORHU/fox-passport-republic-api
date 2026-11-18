-- Indexes only: no table, column or data changes.
-- `messages` and `notifications` had no index besides their primary key, so
-- every chat open, inbox load and unread count read the whole table.
-- On a large, busy table, consider running these as CREATE INDEX CONCURRENTLY
-- (one per migration, outside a transaction) to avoid blocking writes.

-- CreateIndex
CREATE INDEX "conversation_participants_userId_idx" ON "conversation_participants"("userId");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "messages_senderId_idx" ON "messages"("senderId");

-- CreateIndex
CREATE INDEX "messages_replyToId_idx" ON "messages"("replyToId");

-- CreateIndex
CREATE INDEX "messages_sharedPostId_idx" ON "messages"("sharedPostId");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");
