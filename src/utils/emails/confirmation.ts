import { sendResendEmail, wrapEmail, escapeHtml, formatDate } from "./base";

export interface SendBookingConfirmationParams {
  to: string;
  eventName: string;
  bookingId: string;
  startDate: string;
  totalPaid: string;
  venueName?: string | null;
}

export async function sendBookingConfirmationEmail({
  to,
  eventName,
  bookingId,
  startDate,
  totalPaid,
  venueName,
}: SendBookingConfirmationParams): Promise<boolean> {
  const hasVenue = venueName && venueName.trim().toUpperCase() !== "N/A";

  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: "Event", value: eventName },
    ...(hasVenue ? [{ label: "Venue", value: venueName as string }] : []),
    { label: "Date", value: formatDate(startDate) },
    { label: "Total Paid", value: totalPaid },
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

  const inner = `
    <span style="display:inline-block;padding:5px 14px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;background:#d4ff00;color:#111114;">Confirmed</span>

    <h1 style="margin: 18px 0 8px; font-size: 26px; font-weight: 800; color: #111114; letter-spacing: -0.5px;">
      Booking confirmed
    </h1>

    <p style="margin: 0 0 24px; font-size: 15px; color: #55555c; line-height: 1.6;">
      Your booking for <strong style="color:#111114;">${escapeHtml(eventName)}</strong> is all set. Here's your summary:
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background: #f7f7f8; border: 1px solid #e5e5ea; border-radius: 12px; padding: 0 20px; margin-bottom: 24px;">
      ${detailRows}
    </table>

    <p style="margin: 0; font-size: 14px; color: #55555c; line-height: 1.6;">
      Thank you for booking with <strong style="color:#111114;">FoxPassport</strong>! If you have any questions, please contact our support team.
    </p>
  `;

  return sendResendEmail({
    to,
    subject: `Booking Confirmed — ${eventName}`,
    html: wrapEmail(inner, false),
  });
}