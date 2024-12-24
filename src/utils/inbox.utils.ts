import crypto from "crypto";
import { formatTimestamp } from "../utils/enquiries/helpers";

export const generateRoomId = () => {
  return crypto.randomBytes(16).toString("hex");
};

export const generateMessageContent = (payload:any)  => {

  const { 
    guests, 
    own_catering,
    require_catering,
    date,
    details } = payload;

  let content = `${guests} guests`;

  if (details) {
    content += `\n${details}`;
  }

  if (own_catering) {
    content += "\nI want to bring my own catering";
  }

  if (require_catering) {
    content += "\nI require catering";
  }

  content += `\n${formatTimestamp(date)}`;

  return content;
};
