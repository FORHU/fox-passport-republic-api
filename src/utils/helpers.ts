import fs from "fs";
import path from "path";
import { sendEmail } from "./mailer";
import { LOGO_DATA_URI } from "./emails/base";

/**
 
Sends a templated email using the specified parameters.*
@param {Object} params - The parameters for sending the email.
@param {string} params.template_name - The name of the email template to use.
@param {string} params.subject - The subject of the email.
@param {Object} params.email_data - The data to populate the email template.
@param {Array} [params.attachments=[]] - Optional attachments to include in the email.
@param {string|null} [params.cc=null] - Optional CC recipient for the email.*/
/** Placeholder values substituted into an email template. */
export interface EmailData {
  /** Recipient address — every template is sent to this address. */
  email: string;
  [placeholder: string]: string | number;
}

export interface EmailAttachment {
  filename: string;
  path?: string;
  content?: string | Buffer;
  contentType?: string;
}

export interface SendTemplatedEmailParams {
  template_name: string;
  subject: string;
  email_data: EmailData;
  attachments?: EmailAttachment[];
  cc?: string | null;
}

export const sendTemplatedEmail = async ({
  template_name,
  subject,
  email_data,
  attachments = [],
}: SendTemplatedEmailParams): Promise<void> => {
  const html = getHTMLContents({ template_name, email_data });

  await sendEmail({
    to: email_data.email,
    subject,
    html,
    attachments,
  });
};

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

export const handleSendEmail = ({
  to,
  subject,
  html,
  attachments,
}: SendEmailParams) => {
  sendEmail({ to, subject, html, attachments });
};

/**
 
Generates HTML content by replacing placeholders in an email template with provided data.*
@param {Object} params - The parameters for generating the HTML content.
@param {string} params.template_name - The name of the email template file.
@param {Object} params.email_data - An object containing key-value pairs where the key is the placeholder in the template and the value is the data to replace it with.
@returns {string} The generated HTML content with placeholders replaced by the provided data.*/

export const getHTMLContents = ({
  template_name,
  email_data,
}: Pick<SendTemplatedEmailParams, "template_name" | "email_data">): string => {
  const filePath = path.join(process.cwd(), `email-template/${template_name}`);
  let html = fs.readFileSync(filePath, "utf8");
  const data: Record<string, string | number> = {
    ...email_data,
    LOGO_URL: LOGO_DATA_URI,
  };
  for (const key in data) {
    html = html.replace(new RegExp(key, "g"), String(data[key]));
  }
  return html;
};

export const stringBacktickToArray = (input: string = ""): string[] => {
  return input
    .replace(/"/g, "")
    .split(",")
    .map((id) => id.trim());
};

export const ACTIONS = {
  ADD: "add",
  REMOVE: "remove",
  UPDATE: "update",
} as const;

export const getTimeStamp = (): string => {
  const now = new Date();
  return `${(now.getMonth() + 1).toString().padStart(2, "0")}-${now
    .getDate()
    .toString()
    .padStart(2, "0")}-${now.getFullYear()}-${now
    .getHours()
    .toString()
    .padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
};
