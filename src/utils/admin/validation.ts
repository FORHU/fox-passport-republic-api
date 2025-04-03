import { join } from "path";
import { TAnnouncementLog } from "../../models/announcement-log.model";
import { TAnnouncement, targetType } from "../../models/announcement.model";
import { enquiry_status } from "../../models/enquiries.model";
import { space_status } from "../../models/space.model";
import { venue_status } from "../../models/venue.models";
import { customJoi as Joi } from "../customJoi";

export const validateUpdateSpaceStatus = (data: any) => {
  const schema = Joi.object({
    status: Joi.string()
      .valid(...Object.values(space_status))
      .escapeHTML()
      .optional(),
  });

  return schema.validate(data);
};

export const validateGetSpaceSchema = (data: any) => {
  if (data.status && !Array.isArray(data.status)) {
    data.status = data.status.split(",").map((status: string) => status.trim());
  }
  const schema = Joi.object({
    status: Joi.alternatives().try(
      Joi.string()
        .valid(...Object.values(space_status))
        .escapeHTML(),
      Joi.array().items(
        Joi.string()
          .valid(...Object.values(space_status))
          .escapeHTML(),
      ),
    ),
    page: Joi.number().optional(),
    limit: Joi.number().optional(),
  });

  return schema.validate(data);
};

export const validateUpdateVenueStatus = (data: any) => {
  const schema = Joi.object({
    status: Joi.string()
      .valid(...Object.values(venue_status))
      .optional()
      .escapeHTML(),
  });

  return schema.validate(data);
};

export const validateGetVenueSchema = (data: any) => {
  if (data.status && !Array.isArray(data.status)) {
    data.status = data.status.split(",").map((status: string) => status.trim());
  }
  const schema = Joi.object({
    status: Joi.alternatives()
      .try(Joi.string().valid(...Object.values(venue_status)), Joi.array().items(Joi.string().valid(...Object.values(venue_status))))
      .optional(),
    venue_name: Joi.string().escapeHTML().optional().allow(null, ""),
    page: Joi.number().optional(),
    limit: Joi.number().optional(),
  });

  return schema.validate(data);
};

export const validateGetEnquiriesSchema = (data: any) => {
  const schema = Joi.object({
    page: Joi.number().optional(),
    limit: Joi.number().optional(),
    status: Joi.string().valid(...Object.values(enquiry_status)),
  });

  return schema.validate(data);
};

export const validateVenueTransfer = (data: any) => {
  const schema = Joi.object({
    email: Joi.string().escapeHTML().required(),
  });

  return schema.validate(data);
};

const targetValues = Object.values(targetType).join("|");

export const validateAnnouncementSchema = (data: TAnnouncement) => {
  const schema = Joi.object({
    _id: Joi.string().escapeHTML().optional().allow(null, ""),
    attachment: Joi.string().escapeHTML().optional().allow(null, ""),
    title: Joi.string().escapeHTML().optional().allow(null, ""),
    description: Joi.string().escapeHTML().optional().allow(null, ""),
    active: Joi.boolean().optional(),
    validUntil: Joi.date().optional().allow(null, ""),
    target: Joi.string()
      .custom((value, helpers) => {
        if (!value) return value;
        const values = value.split(",").map((v: string) => v.trim());
        const invalidValues = values.filter((v: string) => !targetValues.includes(v));
        if (invalidValues.length) {
          return helpers.error("any.invalid", { message: `Invalid target values: ${invalidValues.join(", ")}` });
        }

        return value;
      })
      .optional()
      .allow(null, ""),
    page: Joi.number().optional().allow(null, ""),
    limit: Joi.number().optional().allow(null, ""),
    search: Joi.string().escapeHTML().optional().allow(null, ""),
    sort: Joi.number().optional().allow(null, ""),
  });
  return schema.validate(data);
};

export const validateAnnouncementLogSchema = (data: TAnnouncementLog) => {
  const schema = Joi.object({
    _id: Joi.string().escapeHTML().optional().allow(null, ""),
    announcement: Joi.string().escapeHTML().optional().allow(null, ""),
    viewed: Joi.boolean().optional().allow(null, ""),
  });
  return schema.validate(data);
};
