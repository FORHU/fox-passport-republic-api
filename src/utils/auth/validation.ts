import { user_role } from "../../models/user.model";
import { customJoi as Joi } from "../customJoi";

export const validateRegistrationSchema = (data: any) => {
  const schema = Joi.object({
    email: Joi.string().escapeHTML().email().required(),
    password: Joi.string().escapeHTML().min(6).required(),
    role: Joi.string().escapeHTML().optional(),
    phone_number: Joi.string().escapeHTML().allow("").required(),
    date_of_birth: Joi.string().escapeHTML().allow(null, "").optional(),
    first_name: Joi.string().escapeHTML().allow(null, "").optional(),
    last_name: Joi.string().escapeHTML().allow(null, "").optional(),
    company_name: Joi.string().escapeHTML().allow(null, "").optional(),
    venue_name: Joi.string().escapeHTML().allow(null, "").optional(),
    postal: Joi.string().escapeHTML().allow(null, "").optional(),
    country: Joi.string().escapeHTML().allow(null, "").optional(),
    social_link: Joi.string().escapeHTML().allow(null, "").optional(),
    tenant: Joi.any(),
  });
  return schema.validate(data);
};

export const validateLoginSchema = (data: any) => {
  const schema = Joi.object({
    email: Joi.string().escapeHTML().email().required(),
    password: Joi.string().escapeHTML().required(),
    role: Joi.string()
      .valid(...Object.values(user_role))
      .escapeHTML()
      .required(),
  });
  return schema.validate(data);
};

export const validateRefreshTokenSchema = (data: any) => {
  const schema = Joi.object({
    refreshToken: Joi.string().escapeHTML().required(),
  });
  return schema.validate(data);
};

export const validateEmailSchema = (data: any) => {
  const schema = Joi.object({
    email: Joi.string().email().escapeHTML().required(),
  });

  return schema.validate(data);
};

export const validateTeamMemberInvite = (data: any) => {
  const schema = Joi.object({
    email: Joi.string().escapeHTML().email().required(),
    venues: Joi.array().items(Joi.string().escapeHTML()).optional(),
    assigned_roles: Joi.object({
      ADMIN: Joi.boolean().required(),
      VENUE_LISTER: Joi.boolean().required(),
      EVENTS_MANAGER: Joi.boolean().required(),
      FINANCE_ACCOUNTING: Joi.boolean().required(),
    }).required(),
  });

  return schema.validate(data);
};

export const validateRoleSchema = (data: any) => {
  const schema = Joi.object({
    role: Joi.string()
      .valid(...Object.values(user_role))
      .escapeHTML()
      .required(),
  });

  return schema.validate(data);
};
