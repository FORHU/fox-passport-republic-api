import { sendResendEmail, wrapEmail, escapeHtml } from "./base";
import { FRONTEND_URL } from "../../config";

export interface SendWaitlistSpotAvailableParams {
  to: string;
  eventName: string;
  templateId: string;
}

export async function sendWaitlistSpotAvailableEmail({
  to,
  eventName,
  templateId,
}: SendWaitlistSpotAvailableParams): Promise<boolean> {
  const bookingUrl = `${FRONTEND_URL}/events/${templateId}`;

  const inner = `
    <span style="display:inline-block;padding:5px 14px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;background:#d4ff00;color:#111114;">Waitlist</span>

    <h1 style="margin: 18px 0 8px; font-size: 26px; font-weight: 800; color: #111114; letter-spacing: -0.5px;">
      A spot opened up!
    </h1>

    <p style="margin: 0 0 24px; font-size: 15px; color: #55555c; line-height: 1.6;">
      Good news — a spot just opened for <strong style="color:#111114;">${escapeHtml(eventName)}</strong>. Book now before it fills up again.
    </p>

    <a href="${bookingUrl}" style="display:inline-block;padding:14px 32px;background:#111114;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:-0.2px;">
      Book Now
    </a>

    <p style="margin: 24px 0 0; font-size: 14px; color: #55555c; line-height: 1.6;">
      If you don't book soon, the spot may go to the next person on the waitlist.
    </p>
  `;

  return sendResendEmail({
    to,
    subject: `Spot Available — ${eventName}`,
    html: wrapEmail(inner, false),
  });
}
