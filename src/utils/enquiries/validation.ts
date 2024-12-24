import { customJoi as Joi } from "../customJoi";

import { cateringOptionsName, enquiry_status } from "../../models/enquiries.model";

export const validateCreateEnquiriesSchema = (data: any) => {
  const schema = Joi.object({
    date: Joi.object({
      date: Joi.string().escapeHTML().optional().allow("").optional(),
      timestamp: Joi.date().iso().allow("").optional(),
      from: Joi.string().escapeHTML().optional(),
      to: Joi.string().escapeHTML().optional(),
    }),
    type: Joi.string().escapeHTML().optional(),
    guests: Joi.number().integer().optional(),
    value: Joi.number().integer().optional(),
    space: Joi.string().escapeHTML().optional(),
    status: Joi.string()
      .escapeHTML()
      .valid(...Object.values(enquiry_status))
      .optional(),
    own_catering: Joi.boolean().optional(),
    require_catering: Joi.boolean().optional(),
    flexible_time: Joi.boolean().optional(),
    catering_options: Joi.array()
      .items(
        Joi.object({
          name: Joi.string()
            .escapeHTML()
            .valid(...Object.values(cateringOptionsName))
            .optional()
            .allow(null),
          value: Joi.boolean().optional().allow(null),
        }),
      )
      .optional()
      .allow(null),
    message: Joi.string().escapeHTML().optional().allow(null),
  });

  return schema.validate(data);
};

export const validateGetEnquiriesSchema = (data: any) => {
  const schema = Joi.object({
    space_id: Joi.string().escapeHTML().optional().allow(null, ""),
    venue_id: Joi.string().escapeHTML().optional().allow(null, ""),
    enquiry_id: Joi.string().escapeHTML().optional().allow(null, ""),
    status: Joi.string().escapeHTML().optional().allow(null, ""),
    page: Joi.number().allow(null, ""),
    limit: Joi.number().allow(null, ""),
    user_id: Joi.string().escapeHTML().allow(null, ""),
    toggle_censor: Joi.boolean().allow(null, ""),
    toggle_current: Joi.boolean().allow(null, ""),
    search_name: Joi.string().escapeHTML().allow(null, ""),
    event_type: Joi.string().escapeHTML().allow(null, ""),
    guests: Joi.number().allow(null, ""),
    event_date: Joi.string().escapeHTML().allow(null, ""),
  });
  return schema.validate(data);
};

export const validateUpdateEnquiriesSchema = (data: any) => {
  const schema = Joi.object({
    status: Joi.string()
      .escapeHTML()
      .valid(
        enquiry_status.ARCHIVED,
        enquiry_status.DECLINED,
        enquiry_status.OFFER_ACCEPTED,
        enquiry_status.CANCELLED,
        enquiry_status.NEW,
        enquiry_status.BOOKING_REQUEST_DECLINED,
        enquiry_status.BOOKING_REQUEST_WITHDRAWN,
      )
      .optional(),
  });
  return schema.validate(data);
};

export const validateCreateProduct = (data: any) => {
  const schema = Joi.object({
    name: Joi.string().escapeHTML().required(),
    description: Joi.string().escapeHTML().optional(),
    price: Joi.number().required(),
    currency: Joi.string().escapeHTML().required(),
    recurring: Joi.string().escapeHTML().optional(),
    country: Joi.string().escapeHTML().required(),
  });
  return schema.validate(data);
};
