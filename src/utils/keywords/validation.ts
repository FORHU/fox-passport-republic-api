import { customJoi as Joi } from "../customJoi";

export const validateGetKeywordsSchema = (data: any) => {
  const schema = Joi.object({
    page: Joi.number(),
    limit: Joi.number(),
    category: Joi.string().escapeHTML().allow(null),
  });

  return schema.validate(data);
};

export const validateCreateKeywordsSchema = (data: any) => {
  const schema = Joi.object({
    keywords: Joi.array()
      .items(
        Joi.object({
          keyword: Joi.string().escapeHTML().required(),
          categories: Joi.array().items(Joi.string().escapeHTML()).required(),
        }),
      )
      .required(),
  });

  return schema.validate(data);
};

export const validateUpdateKeywordsSchema = (data: any) => {
  const keywordSchema = Joi.object({
    keyword_id: Joi.string().escapeHTML().required(),
    payload: Joi.object({
      keyword: Joi.string().escapeHTML().required(),
      categories: Joi.array().items(Joi.string().escapeHTML()).required(),
    }).required(),
  });

  const schema = Joi.object({
    keywords: Joi.array().items(keywordSchema).min(1).required(),
  });

  return schema.validate(data);
};
