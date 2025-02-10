import { randomBytes } from "crypto";

import { account_transcation_status } from "../../../models/stripe-account-transaction.model";
import PaymentSvc from "../../../services/payment.service";
import StripeAccountTransactionSvc from "../../../services/stripe-account-transaction.service";
import { convertDollarsToCents } from "../../helpers";
import { logger } from "../../logger";
import { createTransfer } from "../../stripe";
import { createQueue } from "../index";

export const paymentQueue = createQueue("paymentQueue");
const BATCH_SIZE = 50;

// Function to queue payment jobs in batches
const enqueuePaymentJobs = async (query: any) => {
  const accountTransactionsCount = await StripeAccountTransactionSvc.countAccounts(query);

  for (let offset = 0; offset < accountTransactionsCount; offset += BATCH_SIZE) {
    const buffer = randomBytes(16);
    const jobId = buffer.toString("hex");
    await paymentQueue.add("process_payment", { query, offset, limit: BATCH_SIZE }, { jobId: `batch-${jobId}`, attempts: 3 });
  }
};

// Queue processor
paymentQueue.process("process_payment", async (job: any, done: any) => {
  logger.log({
    level: "info",
    message: "[process_payment] started queue.",
  });
  try {
    const { query, offset, limit } = job.data;
    const accountTransactions = await StripeAccountTransactionSvc.getAccounts(query, offset, limit);
    logger.log({
      level: "info",
      message: `[process_payment]: Processing ${accountTransactions.length} transactions.`,
    });
    const promises = accountTransactions.map(async (val) => {
      let transfer_status = account_transcation_status.COMPLETED;
      let recurring = false;
      const stripe_account = val.stripe_account.stripe_account_id;
      const amount = convertDollarsToCents(val.amount);
      const payment = await PaymentSvc.getPayment({ _id: val.payment });
      const currency = payment?.currency || "sgd";

      const transferFunds: { error: Boolean; message: string } = await createTransfer(stripe_account, amount, currency);
      if (transferFunds.error) {
        recurring = true;
        transfer_status = account_transcation_status.FAILED;
      }
      await StripeAccountTransactionSvc.updateAccount(
        { _id: val._id },
        { status: transfer_status, updatedAt: new Date(), message: transferFunds.message, recurring },
      );
    });
    await Promise.all(promises);
    done();
  } catch (error) {
    logger.log({
      level: "error",
      message: `[process_payment]: PAYLOAD_ERROR ${JSON.stringify({ error })}.`,
    });
    done(error);
  }
});

// Initialize and schedule the payment jobs
export const initPaymentQueueProcess = async () => {
  try {
    const query = {
      status: "FAILED",
      recurring: true,
    };

    await enqueuePaymentJobs(query);

    logger.log({
      level: "info",
      message: "Payment processing jobs scheduled in batches.",
    });
  } catch (error: any) {
    console.log(error);
    logger.log({
      level: "error",
      message: `Failed to initialize payment jobs: ${error.message}`,
    });
  }
};
