import { decode } from "html-entities";
import Joi, { CustomHelpers, Root, StringSchema } from "joi";
import sanitizeHtml from "sanitize-html";
declare module "joi" {
  interface StringSchema {
    escapeHTML(): this;
  }
}
const extension = (joi: Root) => ({
  type: "string",
  base: joi.string(),
  messages: {
    "string.escapeHTML": "{{#label}} must not include HTML!",
  },
  rules: {
    escapeHTML: {
      validate(value: string, helpers: CustomHelpers) {
        const clean = sanitizeHtml(value, {
          allowedTags: [],
          allowedAttributes: {},
        });
        const decodedValue: string = decode(clean);
        if (decodedValue !== value) {
          return helpers.error("string.escapeHTML", { value });
        }
        return clean;
      },
    },
  },
});

export const customJoi: typeof Joi = Joi.extend(extension);
