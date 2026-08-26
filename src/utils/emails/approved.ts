import { sendResendEmail, wrapEmail, escapeHtml } from "./base";

export interface SendApprovedEmailParams {
  to: string;
  entityName: string;
  entityType: string;
}

export async function sendApprovedEmail({
  to,
  entityName,
  entityType,
}: SendApprovedEmailParams): Promise<boolean> {
  const inner = `
    <span style="display:inline-block;padding:5px 14px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;background:#d4ff00;color:#111114;">Approved</span>

    <h1 style="margin: 18px 0 8px; font-size: 26px; font-weight: 800; color: #111114; letter-spacing: -0.5px;">
      Your ${escapeHtml(entityType)} has been approved!
    </h1>

    <p style="margin: 0 0 24px; font-size: 15px; color: #55555c; line-height: 1.6;">
      Great news — <strong style="color:#111114;">${escapeHtml(entityName)}</strong> has been reviewed and approved. It is now live and available.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background: #f7f7f8; border: 1px solid #e5e5ea; border-radius: 12px; padding: 0 20px; margin-bottom: 24px;">
      <tr>
        <td style="padding: 16px 0 4px; border-top: none; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #8b8b93;">
          ${escapeHtml(entityType)}
        </td>
      </tr>
      <tr>
        <td style="padding: 0 0 12px; font-size: 15px; font-weight: 600; color: #111114; word-break: break-all;">
          ${escapeHtml(entityName)}
        </td>
      </tr>
      <tr>
        <td style="padding: 16px 0 4px; border-top: 1px solid #e5e5ea; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #8b8b93;">
          Status
        </td>
      </tr>
      <tr>
        <td style="padding: 0 0 12px; font-size: 15px; font-weight: 600; color: #111114;">
          Approved
        </td>
      </tr>
    </table>

    <div style="text-align:center;margin:24px 0;">
      <a href="${process.env.FRONTEND_URL || "http://localhost:6001"}/dashboard"
         style="display:inline-block;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:700;text-decoration:none;background:#d4ff00;color:#111114;">
        View Dashboard
      </a>
    </div>

    <p style="margin: 0; font-size: 14px; color: #55555c; line-height: 1.6;">
      If you have any questions, please contact our support team.
    </p>
  `;

  return sendResendEmail({
    to,
    subject: `${entityType} Approved — ${entityName}`,
    html: wrapEmail(inner),
  });
}
