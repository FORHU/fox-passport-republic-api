import fs from "fs";
import path from "path";
import { Resend } from "resend";
import { RESEND_API_KEY } from "../config";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const FROM_ADDRESS = "FoxPassport <onboarding@foxpassport.com>";

export async function sendResendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  console.log(`\n========== EMAIL TO: ${to} ==========`);
  console.log(`Subject: ${subject}`);
  console.log(`Content:\n${html.replace(/<[^>]+>/g, "").substring(0, 500)}`);
  console.log(`========================================\n`);

  if (!resend) {
    console.log(`[DEV] Email would be sent to ${to}: ${subject}`);
    return;
  }

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to ,
      subject,
      html,
    });
    console.log(`Resend email sent to ${to}: ${subject}`);
  } catch (error) {
    console.error(`Resend email failed to ${to}:`, error);
  }
}

function loadTemplate(templateName: string, data: Record<string, string>): string {
  const filePath = path.join(process.cwd(), `email-template/${templateName}`);
  let html = fs.readFileSync(filePath, "utf8");
  for (const [key, value] of Object.entries(data)) {
    html = html.replace(new RegExp(key, "g"), value);
  }
  return html;
}

export async function sendBookingCancelledEmail({
  to,
  eventName,
  bookingId,
  startDate,
  totalPaid,
  refundAmount,
  refundStatus,
}: {
  to: string;
  eventName: string;
  bookingId: string;
  startDate: string;
  totalPaid: string;
  refundAmount: string;
  refundStatus: string;
}): Promise<void> {
  const html = loadTemplate("booking-cancelled.html", {
    EVENT_NAME: eventName,
    BOOKING_ID: bookingId,
    START_DATE: startDate,
    TOTAL_PAID: totalPaid,
    REFUND_AMOUNT: refundAmount,
    REFUND_STATUS: refundStatus,
  });

  await sendResendEmail({
    to,
    subject: `Booking Cancelled — ${eventName}`,
    html,
  });
}

export async function sendRefundUpdateEmail({
  to,
  eventName,
  bookingId,
  refundAmount,
  status,
  failureReason,
}: {
  to: string;
  eventName: string;
  bookingId: string;
  refundAmount: string;
  status: "succeeded" | "failed" | "pending";
  failureReason?: string;
}): Promise<void> {
  const statusLabels: Record<string, string> = {
    succeeded: "Succeeded",
    failed: "Failed",
    pending: "Processing",
  };
  const statusVerbs: Record<string, string> = {
    succeeded: "succeeded",
    failed: "has failed",
    pending: "is being processed",
  };
  const statusClasses: Record<string, string> = {
    succeeded: "succeeded",
    failed: "failed",
    pending: "pending",
  };

  const html = loadTemplate("refund-update.html", {
    EVENT_NAME: eventName,
    BOOKING_ID: bookingId,
    REFUND_AMOUNT: refundAmount,
    STATUS_CLASS: statusClasses[status] || "pending",
    REFUND_STATUS_TEXT: statusLabels[status] || "Processing",
    REFUND_STATUS_VERB: statusVerbs[status] || "is being processed",
    FAILURE_REASON: failureReason
      ? `<div style="color: #ff6b6b; font-size: 13px; margin-top: 8px;">Reason: ${failureReason}</div>`
      : "",
  });

  await sendResendEmail({
    to,
    subject: `Refund ${statusLabels[status] || "Update"} — ${eventName}`,
    html,
  });
}
