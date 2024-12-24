import Joi from "joi";

export const validateCreateRatingSchema = (data: any) => {
  const schema = Joi.object({
    rating: Joi.number().required(),
  });
  return schema.validate(data);
};
