import { PriceType, PricingOptions, WeekdaysType } from "../../models/pricing.model";
import { space_represent, space_status, unit_area } from "../../models/space.model";
import { customJoi as Joi } from "../customJoi";
import { updateOpeningHoursPreview } from "./logic";

export const validateGetSpacesSchema = (data: any) => {
  const schema = Joi.object({
    space_photo: Joi.string().escapeHTML().allow(null),
    page: Joi.number(),
    limit: Joi.number(),
    user_id: Joi.string().escapeHTML().allow(null),
    venue_id: Joi.string().escapeHTML().allow(null),
    space_id: Joi.string().escapeHTML().allow(null),
    keywords: Joi.string().escapeHTML().allow(null),
    categories: Joi.string().escapeHTML().allow(null),
    total_guest: Joi.number().allow(null),
    mark_as_favorite: Joi.boolean().allow(null),
    start_date: Joi.string().escapeHTML().optional(),
    end_date: Joi.string().escapeHTML().optional(),
    start_time: Joi.string().escapeHTML().optional(),
    end_time: Joi.string().escapeHTML().optional(),
    location: Joi.string().escapeHTML().optional().allow(null),
    city: Joi.string().escapeHTML().optional(),
    state: Joi.string().escapeHTML().optional(),
    min_price: Joi.number().optional(),
    max_price: Joi.number().optional(),
    capacity_layout: Joi.string().escapeHTML().optional(),
    representation: Joi.string().escapeHTML().optional(),
    bookings: Joi.object({
      search_date: Joi.string().escapeHTML().optional(),
    }).optional(),
    status: Joi.alternatives()
      .try(
        Joi.string()
          .escapeHTML()
          .valid(...Object.values(space_status)),
        Joi.array().items(
          Joi.string()
            .escapeHTML()
            .valid(...Object.values(space_status)),
        ),
      )
      .optional(),
    age_restriction: Joi.boolean().optional(),
    min_age_requirement: Joi.string().escapeHTML().optional(),
    enforcement_time: Joi.string().escapeHTML().optional(),
    foods_and_beverages: Joi.string().escapeHTML().optional(),
    menu_offer: Joi.string().escapeHTML().optional(),
    cancellation_flexibility: Joi.boolean().optional(),
    facilities: Joi.string().escapeHTML().optional(),
    allow_events: Joi.string().escapeHTML().optional(),
    accessibility_features: Joi.string().escapeHTML().optional(),
    parking_and_accommodation: Joi.string().escapeHTML().optional(),
    open_days: Joi.string().escapeHTML().optional().allow(null),
    max_capacity: Joi.number().optional().allow(null),
    most_popular: Joi.boolean().optional().allow(null),
    recently_listed: Joi.boolean().optional().allow(null),
    country: Joi.string().escapeHTML().optional().allow(null),
    fully_verified: Joi.string().escapeHTML().optional().allow(null),
  });

  return schema.validate(data);
};

export const validateCreateSpaceSchema = (data: any) => {
  const schema = Joi.object({
    name: Joi.string().escapeHTML().optional().allow(null, ""),
    venue_id: Joi.string().escapeHTML().optional(),
    type: Joi.string().escapeHTML().optional().allow(null, ""),
    representation: Joi.string().escapeHTML().optional().allow(null, ""),
    description: Joi.string().escapeHTML().optional().allow(null, ""),
    form_steps: Joi.string().escapeHTML().optional().allow(null, ""),
    status: Joi.string().escapeHTML().allow(space_status.DRAFT, space_status.INPROGRESS, space_status.FOR_APPROVAL).optional().allow(null, ""),
  });

  return schema.validate(data);
};

const questionSchemaValidation = Joi.array()
  .items(
    Joi.object({
      _id: Joi.string().escapeHTML().optional(),
      question: Joi.string().escapeHTML().optional(),
      answer: Joi.boolean().optional(),
      type: Joi.string().escapeHTML().valid("SPACE", "VENUE").optional(),
      options: Joi.array().items(Joi.string().escapeHTML()).optional(),
      max_capacity: Joi.any().optional(),
      reference: Joi.string().escapeHTML().optional(),
      key: Joi.string().escapeHTML().optional(),
    }),
  )
  .optional();

const keywordsSchemaValidation = Joi.array()
  .items(
    Joi.object({
      _id: Joi.string().escapeHTML().optional(),
      keyword: Joi.string().escapeHTML().optional(),
      categories: Joi.array().items(Joi.string().escapeHTML()).optional(),
      type: Joi.string().escapeHTML().valid("SPACE", "VENUE").optional(),
    }),
  )
  .optional();

export const validateUpdateSpaceSchema = (data: any) => {
  const schema = Joi.object({
    name: Joi.string().escapeHTML().optional(),
    type: Joi.string().escapeHTML().optional(),
    representation: Joi.string()
      .escapeHTML()
      .valid(...Object.values(space_represent))
      .optional(),
    description: Joi.string().escapeHTML().optional(),
    space_photo: Joi.array().items(Joi.string().escapeHTML()).min(0).optional(),
    venue_photo: Joi.array().items(Joi.string().escapeHTML()).min(0).optional(),
    menu_photo: Joi.array().items(Joi.string().escapeHTML()).min(0).optional(),
    floor_plan: Joi.array().items(Joi.string().escapeHTML()).optional(),
    capacity_layout: questionSchemaValidation.optional(),
    guest_capacity: Joi.object({
      minimum: Joi.number().integer().allow(null),
      maximum: Joi.number().integer().allow(null),
      floorspace: Joi.object({
        value: Joi.number().allow(null).optional(),
        unit: Joi.string()
          .escapeHTML()
          .valid(...Object.values(unit_area))
          .optional(),
      }).optional(),
    }).optional(),
    features: questionSchemaValidation.optional(),
    keywords: keywordsSchemaValidation.optional(),
    floor_space: Joi.object({
      value: Joi.number().allow(null).optional(),
      unit: Joi.string()
        .escapeHTML()
        .valid(...Object.values(unit_area))
        .optional(),
    }).optional(),
    pricing: Joi.object({
      selected_pricing: Joi.string()
        .escapeHTML()
        .valid(...Object.values(PricingOptions))
        .optional(),
      cleaning_fee: Joi.number().allow(null),
      hire_fee: Joi.object({
        days: Joi.array()
          .items(
            Joi.object({
              name: Joi.string()
                .escapeHTML()
                .valid(...Object.values(WeekdaysType))
                .optional(),
              fullRateCheckkBox: Joi.boolean().optional(),
              full_day_hours: Joi.number().optional().allow(null),
              hourlyCheckBox: Joi.boolean().optional(),
              slots: Joi.object({
                start: Joi.string().escapeHTML().optional().allow(null),
                end: Joi.string().escapeHTML().optional().allow(null),
                rate: Joi.number().allow(null).optional(),
              }).optional(),
              full_day_rate: Joi.number().allow(null).optional(),
              currency: Joi.string().escapeHTML().optional(),
            }),
          )
          .optional(),
        minimum_booking_hours: Joi.alternatives().try(Joi.string().escapeHTML().allow(null), Joi.number().allow(null)).optional(),
        hire_fee_comment: Joi.string().escapeHTML().allow(""),
      }).optional(),
      custom_price: Joi.object({
        prices: Joi.array()
          .items(
            Joi.object({
              price: Joi.number().allow(null),
              duration: Joi.string().escapeHTML().allow(null),
              minimum_spend: Joi.number().allow(null),
              package_per_person: Joi.number().allow(null),
              time: Joi.object({
                from: Joi.string().escapeHTML().allow(""),
                to: Joi.string().escapeHTML().allow(""),
              }).optional(),
              weekdays: Joi.array()
                .items(
                  Joi.string()
                    .escapeHTML()
                    .valid(...Object.values(WeekdaysType)),
                )
                .optional(),
              type: Joi.string()
                .escapeHTML()
                .valid(...Object.values(PriceType))
                .optional(),
            }),
          )
          .optional(),
        opening_hours_private_hour: Joi.boolean().optional(),
        opening_hours_preview: Joi.object({
          time: Joi.object({
            from: Joi.string().escapeHTML().optional(),
            to: Joi.string().escapeHTML().optional(),
          }).optional(),
          weekdays: Joi.array()
            .items(
              Joi.string()
                .escapeHTML()
                .valid(...Object.values(WeekdaysType)),
            )
            .optional(),
        }).optional(),
        flexible_pricing_description: Joi.string().escapeHTML().allow(""),
        pricing_description: Joi.string().escapeHTML().allow(""),
        catering_prices_description: Joi.string().escapeHTML().allow(""),
        package_per_person_description: Joi.string().escapeHTML().allow(""),
      }).optional(),
      currency: Joi.string().escapeHTML().required(),
    }).optional(),
    form_steps: Joi.number().optional(),
    status: Joi.string().escapeHTML().allow(space_status.DRAFT, space_status.INPROGRESS, space_status.FOR_APPROVAL, space_status.DELETED).optional(),
  });

  const result = schema.validate(data);
  updateOpeningHoursPreview(data);
  return result;
};

export const validateDeleteSpaceSchema = (data: any) => {
  const schema = Joi.object({
    space_ids: Joi.alternatives().try(Joi.string().escapeHTML(), Joi.array().items(Joi.string().escapeHTML())).allow(null),
  });

  return schema.validate(data);
};
