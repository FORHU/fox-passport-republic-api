import { customJoi as Joi } from "../customJoi";
import { CancellationPolicy } from "../../models/cancellation-policy.model";

export const validateCreateCancellationPolicySchema = (data: any) => {
  const schema = Joi.object({
    venue_id: Joi.string().escapeHTML().optional(),
    description: Joi.string().escapeHTML().required(),
    policy: Joi.object({
      cancellation_range: Joi.number()
        .valid(...Object.values(CancellationPolicy))
        .optional(),
      custom: Joi.object({
        days_at_least: Joi.number().optional(),
        total_hire_cost: Joi.number().optional(),
      }),
      no_cancellation: Joi.boolean().optional(),
    }),
    allow_rescheduling: Joi.object({
      answer: Joi.boolean().required(),
      months: Joi.number().required(),
    }).required(),
  });

  return schema.validate(data);
};

export const validateUpdateCancellationPolicySchema = (data: any) => {
  const schema = Joi.object({
    description: Joi.string().escapeHTML().required(),
    policy: Joi.object({
      cancellation_range: Joi.number()
        .valid(...Object.values(CancellationPolicy))
        .optional(),
      custom: Joi.object({
        days_at_least: Joi.number().optional(),
        total_hire_cost: Joi.number().optional(),
      }),
      no_cancellation: Joi.boolean().optional(),
    }),
    allow_rescheduling: Joi.object({
      answer: Joi.boolean().required(),
      months: Joi.number().required(),
    }).required(),
  });

  return schema.validate(data);
};

export const validateGetCancellationPolicySchema = (data: any) => {
  const schema = Joi.object({
    venue_id: Joi.string().escapeHTML().optional(),
  });

  return schema.validate(data);
};
