import { customJoi as Joi } from "../customJoi";
import { offer_status } from "../../models/custom-offer.model";
import { verifyObjectId } from "../helpers";

export const validateCreateCOSchema = (data: any) => {
  const schema = Joi.object({
    inbox_id: Joi.string().escapeHTML().required(),
    date: Joi.object({
      date: Joi.string().escapeHTML().required(),
      timestamp: Joi.string().escapeHTML().optional().allow(""),
      from: Joi.string().escapeHTML().required(),
      to: Joi.string().escapeHTML().required(),
    }).required(),
    guests: Joi.number().required(),
    venue_computation: Joi.object({
      subtotal: Joi.number().optional().allow(null),
      commission_fee: Joi.number().optional().allow(null),
      grand_total: Joi.number().optional().allow(null),
      cleaning_fee: Joi.number().optional().allow(null),
    }).optional(),
    user_computation: Joi.object({
      subtotal: Joi.number().optional().allow(null),
      rebate: Joi.number().optional().allow(null),
      grand_total: Joi.number().optional().allow(null),
      cleaning_fee: Joi.number().optional().allow(null),
    }).optional(),
    status: Joi.string()
      .escapeHTML()
      .valid(...Object.values(offer_status))
      .optional(),
    notes: Joi.string().escapeHTML().optional(),
    currency: Joi.string().escapeHTML().required(),
    event_type: Joi.string().escapeHTML().optional(),
  });

  return schema.validate(data);
};

export const validateGetCOSchema = (data: any) => {
  const schema = Joi.object({
    user_id: Joi.string().escapeHTML().optional(),
    offer_id: Joi.string().escapeHTML().optional(),
    venue_id: Joi.string().escapeHTML().optional(),
    space_id: Joi.string().escapeHTML().optional(),
    inbox_id: Joi.string().escapeHTML().optional(),
    guests: Joi.number().optional(),
    status: Joi.string().escapeHTML().optional(),
  });
  return schema.validate(data);
};

export const validateUpdateCOSchema = (data: any) => {
  const schema = Joi.object({
    date: Joi.object({
      date: Joi.string().escapeHTML().optional(),
      timestamp: Joi.string().escapeHTML().optional().allow(""),
      from: Joi.string().escapeHTML().optional(),
      to: Joi.string().escapeHTML().optional(),
    }).optional(),
    guests: Joi.number().optional(),
    venue_computation: Joi.object({
      subtotal: Joi.number().optional(),
      commission_fee: Joi.number().optional(),
      grand_total: Joi.number().optional(),
      cleaning_fee: Joi.number().optional().allow(null),
    }).optional(),
    user_computation: Joi.object({
      subtotal: Joi.number().optional(),
      rebate: Joi.number().optional(),
      grand_total: Joi.number().optional(),
      cleaning_fee: Joi.number().optional().allow(null),
    }).optional(),
    status: Joi.string()
      .escapeHTML()
      .valid(...Object.values(offer_status))
      .optional(),
    notes: Joi.string().escapeHTML().optional().allow(null, ""),
    agree_to_terms: Joi.boolean().optional(),
    message_to_owner: Joi.string().escapeHTML().optional().allow(null, ""),
    currency: Joi.string().escapeHTML().optional(),
    updatedAt: Joi.date().optional(),
    deletedAt: Joi.date().optional().allow(null),
    deletedBy: Joi.string().escapeHTML().optional().allow(null),
  });

  return schema.validate(data);
};

export const validateUpdateOfferStatusSchema = (data: any) => {
  const schema = Joi.object({
    status: Joi.string().escapeHTML().valid("ARCHIVE", "PENDING", "COMPLETED", "OFFER_ACCEPTED", "DECLINED"),
  });

  return schema.validate(data);
};

export const validateGetOneCustomOffer = (data: any) => {
  verifyObjectId(data.id);
  const schema = Joi.object({
    id: Joi.string().escapeHTML().optional(),
  });

  return schema.validate(data);
};
