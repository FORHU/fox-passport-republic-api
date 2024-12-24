import { customJoi as Joi } from "../customJoi";
import { RequestStatus, RequestType } from "../../models/requests.model";

export const validateGetRequests = (data: any) => {
  const Schema = Joi.object({
    user_id: Joi.string().escapeHTML().optional().allow(null, ""),
    venue_id: Joi.string().escapeHTML().optional().allow(null, ""),
    space_id: Joi.string().escapeHTML().optional().allow(null, ""),
    enquiry_id: Joi.string().escapeHTML().optional().allow(null, ""),
    custom_offer_id: Joi.string().escapeHTML().optional().allow(null, ""),
    booking_id: Joi.string().escapeHTML().optional().allow(null, ""),
    request_id: Joi.string().escapeHTML().optional().allow(null, ""),
    type: Joi.string().escapeHTML().optional().allow(null, ""),
  });
  return Schema.validate(data);
};

export const validateCreateRequests = (data: any) => {
  const Schema = Joi.object({
    user_id: Joi.string().escapeHTML().optional(),
    venue_id: Joi.string().escapeHTML().optional(),
    space_id: Joi.string().escapeHTML().optional(),
    enquiry_id: Joi.string().escapeHTML().optional(),
    custom_offer_id: Joi.string().escapeHTML().optional(),
    booking_id: Joi.string().escapeHTML().optional(),
    status: Joi.string()
      .escapeHTML()
      .valid(...Object.values(RequestStatus))
      .optional(),
    type: Joi.string()
      .valid(...Object.values(RequestType))
      .optional(),
    description: Joi.string().escapeHTML().optional(),
    request_data: Joi.object().unknown(true).optional(),
  });
  return Schema.validate(data);
};

export const validateApproveSchema = (data: any) => {
  const Schema = Joi.object({
    status: Joi.string()
      .escapeHTML()
      .valid(...Object.values(RequestStatus))
      .optional(),
    type: Joi.string()
      .escapeHTML()
      .valid(...Object.values(RequestType))
      .optional(),
    description: Joi.string().escapeHTML().optional(),
  });
  return Schema.validate(data);
};

export const validateUpdateRequests = (data: any) => {
  const Schema = Joi.object({
    request_data: Joi.object().unknown(true).optional(),
  });
  return Schema.validate(data);
};
