import { customJoi as Joi } from "../customJoi";

import { CancellationPolicy } from "../../models/cancellation-policy.model";
import { venue_representation, venue_status } from "../../models/venue.models";
import { PaymentMethod } from "../../models/venue-subscription.model";

export const validateCreateVenueSchema = (data: any) => {
  const schema = Joi.object({
    name: Joi.string().escapeHTML().required(),
    representation: Joi.string()
      .escapeHTML()
      .valid(...Object.values(venue_representation))
      .optional(),
    description: Joi.string().escapeHTML().optional(),
    address: Joi.object({
      street: Joi.string().escapeHTML().required(),
      street_2: Joi.string().escapeHTML().optional(),
      city: Joi.string().escapeHTML().required(),
      state: Joi.string().escapeHTML().optional(),
      country: Joi.string().escapeHTML().optional().allow(null, ""),
      postal_code: Joi.string().escapeHTML().optional(),
      coordinates: Joi.object({
        latitude: Joi.number().optional(),
        longitude: Joi.number().optional(),
      }).required(),
    }).optional(),
    keywords: Joi.array()
      .items(
        Joi.object({
          _id: Joi.string().escapeHTML().optional(),
          keyword: Joi.string().escapeHTML().required(),
          categories: Joi.array().items(Joi.string().escapeHTML()).required(),
          type: Joi.string().escapeHTML().valid("SPACE", "VENUE").required(),
        }),
      )
      .optional(),
    form_steps: Joi.number().optional(),
    status: Joi.string().escapeHTML().allow(venue_status.DRAFT, venue_status.INPROGRESS, venue_status.FOR_APPROVAL).optional(),
    subscription: Joi.boolean().optional().allow(null, ""),
    subscription_status: Joi.boolean().optional().allow(null, ""),
    fee: Joi.number().optional().allow(null, ""),
    space_number: Joi.number().optional().allow(null, ""),
  });

  return schema.validate(data);
};

export const validateGetVenueSchema = (data: any) => {
  const schema = Joi.object({
    page: Joi.number(),
    limit: Joi.number(),
    _id: Joi.string().escapeHTML().allow(null),
    user_id: Joi.string().escapeHTML().allow(null),
    venue_id: Joi.string().escapeHTML().allow(null),
    keywords: Joi.string().escapeHTML().optional(),
    categories: Joi.string().escapeHTML().optional(),
    status: Joi.alternatives()
      .try(
        Joi.string()
          .escapeHTML()
          .valid(...Object.values(venue_status)),
        Joi.array().items(Joi.string().valid(...Object.values(venue_status))),
      )
      .optional(),
    venue_name: Joi.string().escapeHTML().optional().allow(null, ""),
  });

  return schema.validate(data);
};

export const validateUpdateVenueSchema = (data: any) => {
  const schema = Joi.object({
    name: Joi.string().escapeHTML().optional(),
    representation: Joi.string()
      .escapeHTML()
      .valid(...Object.values(venue_representation))
      .optional(),
    description: Joi.string().escapeHTML().optional(),
    address: Joi.object({
      street: Joi.string().escapeHTML().optional(),
      street_2: Joi.string().escapeHTML().optional(),
      city: Joi.string().escapeHTML().optional(),
      state: Joi.string().escapeHTML().optional(),
      country: Joi.string().escapeHTML().optional().allow(null, ""),
      postal_code: Joi.string().escapeHTML().optional(),
      coordinates: Joi.object({
        latitude: Joi.number().optional(),
        longitude: Joi.number().optional(),
      }).optional(),
    }).optional(),
    keywords: Joi.array()
      .items(
        Joi.object({
          _id: Joi.string().escapeHTML().optional(),
          keyword: Joi.string().escapeHTML().optional(),
          categories: Joi.array().items(Joi.string().escapeHTML()).optional(),
          type: Joi.string().escapeHTML().valid("SPACE", "VENUE").optional(),
        }),
      )
      .optional(),
    foods_and_beverages: Joi.array()
      .items(
        Joi.object({
          _id: Joi.string().escapeHTML().optional(),
          question: Joi.string().escapeHTML().optional(),
          answer: Joi.boolean().optional(),
          type: Joi.string().escapeHTML().valid("SPACE", "VENUE").optional(),
          options: Joi.array().items(Joi.string().escapeHTML()).optional(),
          reference: Joi.string().escapeHTML().optional(),
          key: Joi.string().escapeHTML().optional(),
          max_capacity: Joi.any().optional(),
        }),
      )
      .optional(),
    venue_details: Joi.array()
      .items(
        Joi.object({
          _id: Joi.string().escapeHTML().optional(),
          question: Joi.string().escapeHTML().optional(),
          answer: Joi.boolean().optional(),
          type: Joi.string().escapeHTML().valid("SPACE", "VENUE").optional(),
          options: Joi.array().items(Joi.string().escapeHTML()).optional(),
          reference: Joi.string().escapeHTML().optional(),
          key: Joi.string().escapeHTML().optional(),
          max_capacity: Joi.any().optional(),
        }),
      )
      .optional(),
    form_steps: Joi.number().optional(),
    cancellation_policy: Joi.object({
      description: Joi.string().escapeHTML().allow("").optional().allow(null),
      policy: Joi.object({
        cancellation_range: Joi.string()
          .escapeHTML()
          .valid(...Object.values(CancellationPolicy))
          .required(),
        custom: Joi.object({
          days_at_least: Joi.object({
            number_of_days: Joi.number().optional().allow(null),
            total_price: Joi.number().optional().allow(null),
          }).optional(),
          days_less_than: Joi.object({
            number_of_days: Joi.number().optional().allow(null),
            total_price: Joi.number().optional().allow(null),
          }).optional(),
          days_less_than_but_at_least: Joi.array()
            .items(
              Joi.object({
                days_less_than: Joi.number().optional().allow(null),
                days_at_least: Joi.number().optional().allow(null),
                total_price: Joi.number().optional().allow(null),
              }),
            )
            .optional(),
        }).optional(),
        no_cancellation: Joi.boolean().optional(),
      }),
      allow_rescheduling: Joi.object({
        answer: Joi.boolean().optional(),
        months: Joi.number().optional().allow(null),
      }).optional(),
    }),
    age_restriction: Joi.object({
      answer: Joi.boolean().optional().allow(null),
      min_age_requirement: Joi.number().optional().allow(null),
      enforcement_time: Joi.string().escapeHTML().optional().allow(null),
    }),
    status: Joi.string()
      .escapeHTML()
      .allow(venue_status.DRAFT, venue_status.INPROGRESS, venue_status.FOR_APPROVAL, venue_status.FOR_DELETION)
      .optional(),
    commission: Joi.number().optional(),
    rebate: Joi.number().optional(),
    payment_method: Joi.string()
      .escapeHTML()
      .valid(...Object.values(PaymentMethod))
      .optional(),
  });
  return schema.validate(data);
};

export const handleVenueAndVenueQuestionsSchema = (data: any) => {
  const schema = Joi.object({
    space_id: Joi.string().escapeHTML().optional().allow(""),
    venue_id: Joi.string().escapeHTML().optional().allow(""),
    type: Joi.string().escapeHTML().valid("SPACE", "VENUE").optional(),
  });
  return schema.validate(data);
};

export const handleVenueAndVenueKeywordsSchema = (data: any) => {
  const schema = Joi.object({
    space_id: Joi.string().escapeHTML().optional().allow(""),
    venue_id: Joi.string().escapeHTML().optional().allow(""),
    type: Joi.string().escapeHTML().valid("SPACE", "VENUE").required(),
  });
  return schema.validate(data);
};

export const handleUpdateValidationSpaceQuestionsSchema = (data: any) => {
  const schema = Joi.object({
    answer: Joi.boolean().required(),
    options: Joi.array().items(Joi.string().escapeHTML()).allow(""),
  });
  return schema.validate(data);
};

export const handleUpdateValidationVenueSpaceKeywordSchema = (data: any) => {
  const schema = Joi.object({
    venue_id: Joi.string().escapeHTML().optional().allow(""),
    space_id: Joi.string().escapeHTML().optional().allow(""),
    type: Joi.string().escapeHTML().valid("SPACE", "VENUE").required(),
    payload: Joi.object({
      keyword_id: Joi.string().escapeHTML().required(),
      keyword: Joi.string().escapeHTML().required(),
      category: Joi.string().escapeHTML().required(),
    }).required(),
  });
  return schema.validate(data);
};

export const validateDeleteVenueSchema = (data: any) => {
  const schema = Joi.object({
    venue_ids: Joi.alternatives().try(Joi.string().escapeHTML(), Joi.array().items(Joi.string().escapeHTML())).allow(null),
  });

  return schema.validate(data);
};
