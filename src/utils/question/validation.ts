import { customJoi as Joi } from "../customJoi";

export const validateCreateQuestions = (data: any) => {
  const schema = Joi.object({
    questions: Joi.array()
      .items(
        Joi.object({
          question: Joi.string().escapeHTML().required(),
          answer: Joi.boolean().required(),
          type: Joi.string().escapeHTML().required(),
          options: Joi.array().items(Joi.string().escapeHTML()).required(),
          reference: Joi.string().escapeHTML().required(),
          title: Joi.string().escapeHTML().required(),
        }),
      )
      .required(),
  });
  return schema.validate(data);
};

export const validateGetQuestions = (data: any) => {
  const schema = Joi.object({
    page: Joi.number(),
    limit: Joi.number(),
    user_id: Joi.string().escapeHTML().allow(null),
    reference: Joi.string().escapeHTML().allow(null),
  });
  return schema.validate(data);
};
