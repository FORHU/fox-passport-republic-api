import { AdminMemberRoles } from "../../models/admin-members.model";
import { suspensionDuration } from "../../models/organization-member.model";
import { customJoi as Joi } from "../customJoi";

export const validateAdminMemberSchema = (data: any) => {
  const schema = Joi.object({
    email: Joi.string().email().optional(),
    assigned_roles: Joi.alternatives()
      .try(Joi.number().valid(...Object.values(AdminMemberRoles)), Joi.array().items(Joi.number().valid(...Object.values(AdminMemberRoles))))
      .optional(),
    venues: Joi.array().items(Joi.string()).single().optional(),
    suspension_time: Joi.string()
      .escapeHTML()
      .valid(...Object.values(suspensionDuration))
      .allow(null, "")
      .optional(),
  });

  return schema.validate(data);
};
