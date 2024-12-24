import { customJoi as Joi } from "../customJoi";
import { RequestStatus, RequestType } from "../../models/requests.model";

export const validateCreateCountry = (data: any) => {
  const Schema = Joi.object({
    country_name: Joi.string().required(),
    commission: Joi.number().required(),
    rebate: Joi.number().required(),
    status: Joi.string(),
    photo: Joi.array().items(Joi.string()).optional(),
    isDefault: Joi.boolean().optional(),
  });
  return Schema.validate(data);
};

export const validateUpdateCountry = (data: any) => {
  const Schema = Joi.object({
    commission: Joi.number().optional(),
    rebate: Joi.number().optional(),
    status: Joi.string().optional(),
    photo: Joi.array().items(Joi.string()).optional(),
    isDefault: Joi.boolean().optional(),
  });
  return Schema.validate(data);
};


export const validateListCountrySetting = (data: any) => {
    const Schema = Joi.object({
        _id: Joi.string().optional().allow(null, ""),
        search: Joi.string().optional().allow(null, ""),
        page:Joi.number().optional(),
        limit:Joi.number().optional(),
    });
    return Schema.validate(data);
  };
  
