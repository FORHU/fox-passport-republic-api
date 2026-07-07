import { sendResendEmail, wrapEmail, escapeHtml } from "./base";

export interface SendRefundUpdateParams {
  to: string;
  eventName: string;
  bookingId: string;
  refundAmount: string;
  status: "succeeded" | "failed" | "pending";
  failureReason?: string;
}

const STATUS_LABELS: Record<string, string> = {
  succeeded: "Succeeded",
  failed: "Failed",
  pending: "Processing",
};

const STATUS_VERBS: Record<string, string> = {
  succeeded: "succeeded",
  failed: "has failed",
  pending: "is being processed",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  succeeded: { bg: "#d4ff00", text: "#111114" },
  failed: { bg: "#ffe3e3", text: "#c92a2a" },
  pending: { bg: "#fff3cd", text: "#8a6100" },
};

export async function sendRefundUpdateEmail({
  to,
  eventName,
  bookingId,
  refundAmount,
  status,
  failureReason,
}: SendRefundUpdateParams): Promise<boolean> {
  const currentStatusLabel = STATUS_LABELS[status] || "Processing";
  const currentStatusVerb = STATUS_VERBS[status] || "is being processed";
  const statusColor = STATUS_COLORS[status] || STATUS_COLORS.pending;

  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: "Event", value: eventName },
    { label: "Booking ID", value: bookingId, mono: true },
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

  const failureReasonHtml = failureReason
    ? `<tr><td style="text-align:center;color:#c92a2a;font-size:13px;padding-top:8px;">Reason: ${escapeHtml(failureReason)}</td></tr>`
    : "";

  const inner = `
    <span style="display:inline-block;padding:5px 14px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;background:${statusColor.bg};color:${statusColor.text};">${currentStatusLabel}</span>

    <h1 style="margin: 18px 0 8px; font-size: 26px; font-weight: 800; color: #111114; letter-spacing: -0.5px;">
      Refund ${currentStatusVerb}
    </h1>

    <p style="margin: 0 0 24px; font-size: 15px; color: #55555c; line-height: 1.6;">
      Your refund for <strong style="color:#111114;">${escapeHtml(eventName)}</strong> has been updated:
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background: #f7f7f8; border: 1px solid #e5e5ea; border-radius: 12px; padding: 0 20px; margin-bottom: 24px;">
      ${detailRows}
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background: #f7f7f8; border: 1px solid #e5e5ea; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px;">
      <tr>
        <td style="text-align:center;color:#8b8b93;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding-bottom:4px;">Refund Amount</td>
      </tr>
      <tr>
        <td style="text-align:center;color:#111114;font-size:28px;font-weight:800;padding:4px 0;font-family:'Space Grotesk',sans-serif;">${escapeHtml(refundAmount)}</td>
      </tr>
      ${failureReasonHtml}
    </table>

    <p style="margin: 0; font-size: 14px; color: #55555c; line-height: 1.6;">
      Your refund ${currentStatusVerb}. Depending on your banking institution, completed settlements may take 5 to 10 business days to reflect on your accounts.
    </p>
  `;

  return sendResendEmail({
    to,
    subject: `Refund ${currentStatusLabel} — ${eventName}`,
    html: wrapEmail(inner, false),
  });
}