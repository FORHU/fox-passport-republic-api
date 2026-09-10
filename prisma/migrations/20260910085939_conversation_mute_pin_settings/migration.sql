-- CreateTable
CREATE TABLE "conversation_settings" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "pinnedAt" TIMESTAMP(3),

    CONSTRAINT "conversation_settings_pkey" PRIMARY KEY ("conversationId","userId")
);

-- AddForeignKey
ALTER TABLE "conversation_settings" ADD CONSTRAINT "conversation_settings_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_settings" ADD CONSTRAINT "conversation_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
