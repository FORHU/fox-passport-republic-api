import { customJoi as Joi } from "../customJoi";

export const validateCreateFavoriteSchema = (data: any) => {
  const schema = Joi.object({
    space_id: Joi.string().escapeHTML().required(),
    folder_name: Joi.string().escapeHTML().optional(),
    favorite_folder_id: Joi.string().escapeHTML().optional().allow(null, ""),
  });

  return schema.validate(data);
};

export const validateUpdateFavoriteSchema = (data: any) => {
  const schema = Joi.object({
    marked_as_favorite: Joi.boolean().required(),
  });
  return schema.validate(data);
};

export const validateAssignToFavoriteFolderSchema = (data: any) => {
  const schema = Joi.object({
    folder_name: Joi.string().escapeHTML().optional().allow(null, ""),
    favorite_folder_id: Joi.string().escapeHTML().optional().allow(null, ""),
  });

  return schema.validate(data);
};
export const validateUpdateFolderSchema = (data: any) => {
  const schema = Joi.object({
    folder_name: Joi.string().escapeHTML().required(),
  });

  return schema.validate(data);
};

export const validateFilterFavoriteSchema = (data: any) => {
  const schema = Joi.object({
    space_id: Joi.string().escapeHTML().optional(),
    folder_name: Joi.string().escapeHTML().optional(),
    favorite_folder_id: Joi.string().escapeHTML().optional().allow(null, ""),
    page: Joi.string().escapeHTML().optional(),
    limit: Joi.string().escapeHTML().optional(),
  });

  return schema.validate(data);
};
export const validateGetFolder = (data: any) => {
  const schema = Joi.object({
    page: Joi.string().escapeHTML().optional(),
    limit: Joi.string().escapeHTML().optional(),
  });

  return schema.validate(data);
};

export const validateRecentlyViewedFilter = (data: any) => {
  const schema = Joi.object({
    action: Joi.string().escapeHTML().optional(),
    start_date: Joi.string().escapeHTML().optional(),
    end_date: Joi.string().escapeHTML().optional(),
    page: Joi.string().escapeHTML().optional(),
    limit: Joi.string().escapeHTML().optional(),
  });
  return schema.validate(data);
};
