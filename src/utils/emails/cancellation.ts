import { sendResendEmail, wrapEmail, escapeHtml, formatDate } from "./base";

export interface SendBookingCancelledParams {
  to: string;
  eventName: string;
  bookingId: string;
  startDate: string;
  totalPaid: string;
  refundAmount: string;
  refundStatus: string;
}

export async function sendBookingCancelledEmail({
  to,
  eventName,
  bookingId,
  startDate,
  totalPaid,
  refundAmount,
  refundStatus,
}: SendBookingCancelledParams): Promise<boolean> {
  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: "Event", value: eventName },
    { label: "Booking ID", value: bookingId, mono: true },
    { label: "Start Date", value: formatDate(startDate) },
    { label: "Total Paid", value: totalPaid },
  ];

  const detailRows = rows
    .map(
      ({ label, value, mono }, i) => `
      <tr>
        <td style="padding: 16px 0 4px; border-top: ${i === 0 ? "none" : "1px solid #e5e5ea"}; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #8b8b93;">
          ${escapeHtml(label)}
        </td>
      </tr>
      <tr>
        <td style="padding: 0 0 12px; font-size: ${mono ? "13px" : "15px"}; font-weight: ${mono ? "500" : "600"}; color: #111114; font-family: ${mono ? "'SFMono-Regular', Consolas, monospace" : "'Plus Jakarta Sans', Arial, sans-serif"}; word-break: break-all;">
          ${escapeHtml(value)}
        </td>
      </tr>`
    )
    .join("");

  const inner = `
    <span style="display:inline-block;padding:5px 14px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;background:#ffe3e3;color:#c92a2a;">Cancelled</span>

    <h1 style="margin: 18px 0 8px; font-size: 26px; font-weight: 800; color: #111114; letter-spacing: -0.5px;">
      Booking cancelled
    </h1>

    <p style="margin: 0 0 24px; font-size: 15px; color: #55555c; line-height: 1.6;">
      Your booking for <strong style="color:#111114;">${escapeHtml(eventName)}</strong> has been cancelled as requested. Here's a summary:
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background: #f7f7f8; border: 1px solid #e5e5ea; border-radius: 12px; padding: 0 20px; margin-bottom: 24px;">
      ${detailRows}
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background: #f7f7f8; border: 1px solid #e5e5ea; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px;">
      <tr>
        <td style="text-align:center;color:#8b8b93;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding-bottom:4px;">Refund</td>
      </tr>
      <tr>
        <td style="text-align:center;color:#111114;font-size:28px;font-weight:800;padding:4px 0;font-family:'Space Grotesk',sans-serif;">${escapeHtml(refundAmount)}</td>
      </tr>
      <tr>
        <td style="text-align:center;color:#8b8b93;font-size:13px;">${escapeHtml(refundStatus)}</td>
      </tr>
    </table>

    <p style="margin: 0; font-size: 14px; color: #55555c; line-height: 1.6;">
      If you have any questions, please contact our support team.
    </p>
  `;

  return sendResendEmail({
    to,
    subject: `Booking Cancelled — ${eventName}`,
    html: wrapEmail(inner, false),
  });
}