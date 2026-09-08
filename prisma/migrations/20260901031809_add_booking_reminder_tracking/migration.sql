-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "paymentReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);
