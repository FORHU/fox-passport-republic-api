import { customJoi as Joi } from "../customJoi";

export const validateCreateSubscription = (data: any) => {
  const Schema = Joi.object({
    price_id: Joi.string().required(),
    venue_id: Joi.string().required(),
    space_number: Joi.number().required(),
  });
  return Schema.validate(data);
};

export const validateUpdateVenueSubscription = (data: any) => {
  const Schema = Joi.object({
    space_number: Joi.number().required(),
  });
  return Schema.validate(data);
};
