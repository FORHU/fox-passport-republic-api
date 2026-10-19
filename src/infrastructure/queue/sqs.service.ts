import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  Message,
} from "@aws-sdk/client-sqs";
import {
  AWS_ACCESS_KEY,
  AWS_SECRET_ACCESS_KEY,
  AWS_REGION,
  AWS_SQS_PAYMENT_QUEUE_URL,
  AWS_SQS_NOTIFICATION_QUEUE_URL,
  SQS_ENDPOINT,
} from "../../config";

export interface PaymentQueueEvent {
  eventType:
    | "payment.succeeded"
    | "payment.failed"
    | "payment.refunded"
    | "payout.processed";
  invoiceId?: string;
  bookingId?: string;
  providerReference?: string;
  amount: number;
  currency: string;
  method: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface NotificationQueueEvent {
  recipient: string;
  type:
    | "booking_confirmation"
    | "payment_receipt"
    | "reminder"
    | "auth_verification"
    | "payout_notification";
  subject?: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export class SqsService {
  private static client: SQSClient | null = null;

  public static getClient(): SQSClient {
    if (!this.client) {
      this.client = new SQSClient({
        region: AWS_REGION || "ap-southeast-1",
        ...(AWS_ACCESS_KEY &&
          AWS_SECRET_ACCESS_KEY && {
            credentials: {
              accessKeyId: AWS_ACCESS_KEY,
              secretAccessKey: AWS_SECRET_ACCESS_KEY,
            },
          }),
        ...(SQS_ENDPOINT && { endpoint: SQS_ENDPOINT }),
      });
    }
    return this.client;
  }

  /**
   * Publishes a payment lifecycle event to the Amazon SQS payment queue.
   */
  public static async sendPaymentEvent(event: PaymentQueueEvent) {
    if (!AWS_SQS_PAYMENT_QUEUE_URL) {
      console.warn(
        `[SQS] AWS_SQS_PAYMENT_QUEUE_URL not configured. Simulating dispatch for event: ${event.eventType}`,
      );
      return { messageId: `mock-payment-${Date.now()}`, simulated: true };
    }

    try {
      const client = this.getClient();
      const command = new SendMessageCommand({
        QueueUrl: AWS_SQS_PAYMENT_QUEUE_URL,
        MessageBody: JSON.stringify(event),
        MessageAttributes: {
          eventType: {
            DataType: "String",
            StringValue: event.eventType,
          },
          currency: {
            DataType: "String",
            StringValue: event.currency,
          },
          method: {
            DataType: "String",
            StringValue: event.method,
          },
        },
      });

      const response = await client.send(command);
      return { messageId: response.MessageId, simulated: false };
    } catch (err: unknown) {
      const error = err as Error;
      console.error(
        `[SQS] Failed to publish payment event to SQS: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Publishes an asynchronous notification/email event to the Amazon SQS notification queue.
   */
  public static async sendNotificationEvent(event: NotificationQueueEvent) {
    if (!AWS_SQS_NOTIFICATION_QUEUE_URL) {
      console.warn(
        `[SQS] AWS_SQS_NOTIFICATION_QUEUE_URL not configured. Simulating dispatch for notification: ${event.type}`,
      );
      return { messageId: `mock-notification-${Date.now()}`, simulated: true };
    }

    try {
      const client = this.getClient();
      const command = new SendMessageCommand({
        QueueUrl: AWS_SQS_NOTIFICATION_QUEUE_URL,
        MessageBody: JSON.stringify(event),
        MessageAttributes: {
          notificationType: {
            DataType: "String",
            StringValue: event.type,
          },
          recipient: {
            DataType: "String",
            StringValue: event.recipient,
          },
        },
      });

      const response = await client.send(command);
      return { messageId: response.MessageId, simulated: false };
    } catch (err: unknown) {
      const error = err as Error;
      console.error(
        `[SQS] Failed to publish notification event to SQS: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Polls messages from a designated SQS queue.
   */
  public static async receiveMessages(
    queueUrl: string,
    maxMessages = 10,
    waitTimeSeconds = 20,
  ): Promise<Message[]> {
    if (!queueUrl) return [];

    try {
      const client = this.getClient();
      const command = new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: waitTimeSeconds,
        MessageAttributeNames: ["All"],
      });

      const response = await client.send(command);
      return response.Messages || [];
    } catch (err: unknown) {
      const error = err as Error;
      console.error(
        `[SQS] Error receiving messages from ${queueUrl}: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Deletes a processed message from an SQS queue.
   */
  public static async deleteMessage(queueUrl: string, receiptHandle: string) {
    if (!queueUrl || !receiptHandle) return;

    try {
      const client = this.getClient();
      const command = new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      });
      await client.send(command);
    } catch (err: unknown) {
      const error = err as Error;
      console.error(
        `[SQS] Error deleting message from ${queueUrl}: ${error.message}`,
      );
    }
  }
}
