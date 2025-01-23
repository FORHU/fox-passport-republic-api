import { OrgRoles, suspensionDuration } from "../../models/organization-member.model";
import { customJoi as Joi } from "../customJoi";

export const validateInvitedUserInformationSchema = (data: any) => {
  const schema = Joi.object({
    first_name: Joi.string().escapeHTML().required(),
    last_name: Joi.string().escapeHTML().required(),
    password: Joi.string().escapeHTML().required(),
    phone_number: Joi.string().escapeHTML().optional().allow(null, ""),
    country: Joi.string().escapeHTML().optional().allow(null, ""),
    venues: Joi.array().items(Joi.string().escapeHTML().optional().allow(null)),
    all_venues: Joi.boolean().optional().allow(null, ""),
    assigned_roles: Joi.array()
      .items(Joi.number().valid(...Object.values(OrgRoles)))
      .optional()
      .allow(null, ""),
    email: Joi.string().escapeHTML().email().optional().allow(null, ""),
  });

  return schema.validate(data);
};

export const validateUpdateTeamMemberSchema = (data: any) => {
  const schema = Joi.object({
    country: Joi.string().escapeHTML().optional().allow(null, ""),
    all_venues: Joi.boolean().optional().allow(null, ""),
    email: Joi.string().escapeHTML().email().optional().allow(null, ""),
    venues: Joi.array().items(Joi.string().escapeHTML().optional().allow(null, "")).optional().allow(null, ""),
    assigned_roles: Joi.array()
      .items(Joi.number().valid(...Object.values(OrgRoles)))
      .optional()
      .allow(null, ""),
    suspension_time: Joi.string()
      .escapeHTML()
      .valid(...Object.values(suspensionDuration))
      .allow(null, "")
      .optional(),
  });

  return schema.validate(data);
};
