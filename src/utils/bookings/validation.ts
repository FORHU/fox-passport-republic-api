import { customJoi as Joi } from "../customJoi";
import { CancellationReason, EventDuration, RepeatEvent } from "../../models/booking.model";

export const validateCreateBookingsSchema = (data: any) => {
  const schema = Joi.object({
    booked_user: Joi.string().escapeHTML().optional().allow(null, ""),
    space: Joi.string().escapeHTML().optional().allow(null, ""),
    venue: Joi.string().escapeHTML().optional().allow(null, ""),
    start_date: Joi.alternatives().try(Joi.string().escapeHTML(), Joi.array().items(Joi.string().escapeHTML())).optional().allow(null, ""),
    start_time: Joi.string().escapeHTML().optional().allow(null, ""),
    end_time: Joi.string().escapeHTML().optional().allow(null, ""),
    total_guest: Joi.number().optional().allow(null, ""),
    total_price: Joi.number().optional().allow(null, ""),
    status: Joi.string().escapeHTML().valid("CONFIRMED", "PENDING", "CANCELLED").optional().allow(null, ""),
    event_type: Joi.string().escapeHTML().optional().allow(null, ""),
    repeat_event: Joi.string()
      .escapeHTML()
      .valid(...Object.values(RepeatEvent))
      .optional()
      .allow(null, ""),
    event_duration: Joi.string()
      .valid(...Object.values(EventDuration))
      .escapeHTML()
      .optional()
      .allow(null, ""),
    optional_input: Joi.object({
      first_name: Joi.string().escapeHTML().optional().allow(null, ""),
      last_name: Joi.string().escapeHTML().optional().allow(null, ""),
      email: Joi.string().escapeHTML().email().optional().allow(null, ""),
    })
      .optional()
      .allow(null),
    proceed_alternative_opt: Joi.boolean().optional(),
  });

  return schema.validate(data);
};

export const validateGetBookingSchema = (data: any) => {
  const schema = Joi.object({
    booking_id: Joi.string().escapeHTML().optional(),
    space_id: Joi.string().escapeHTML().optional(),
    venue_id: Joi.string().escapeHTML().optional(),
    booked_user: Joi.string().escapeHTML().optional(),
    booker: Joi.string().escapeHTML().optional(),
    status: Joi.string().escapeHTML().optional(),
    from: Joi.string().escapeHTML().optional(),
    to: Joi.string().escapeHTML().optional(),
    start_date: Joi.string().escapeHTML().optional(),
    end_date: Joi.string().escapeHTML().optional(),
    event_type: Joi.string().escapeHTML().optional(),
    event_duration: Joi.string()
      .escapeHTML()
      .valid(...Object.values(EventDuration))
      .optional(),
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).optional(),
  });

  return schema.validate(data);
};

export const validateUpdateBookingSchema = (data: any) => {
  const schema = Joi.object({
    booked_user: Joi.string().escapeHTML().optional().allow(null),
    space: Joi.string().escapeHTML().optional().allow(null),
    venue: Joi.string().escapeHTML().optional().allow(null),
    start_date: Joi.alternatives().try(Joi.string().escapeHTML(), Joi.array().items(Joi.string().escapeHTML())).optional().allow(null),
    start_time: Joi.string().escapeHTML().optional().allow(null),
    end_time: Joi.string().escapeHTML().optional().allow(null),
    total_guest: Joi.number().optional().allow(null),
    total_price: Joi.number().optional().allow(null),
    status: Joi.string().escapeHTML().valid("CONFIRMED", "PENDING", "CANCELLED").optional().allow(null),
    event_type: Joi.string().escapeHTML().optional().allow(null),
    repeat_event: Joi.string()
      .escapeHTML()
      .valid(...Object.values(RepeatEvent))
      .optional()
      .allow(null),
    event_duration: Joi.string()
      .escapeHTML()
      .valid(...Object.values(EventDuration))
      .optional()
      .allow(null),
    optional_input: Joi.object({
      first_name: Joi.string().escapeHTML().optional().allow(null, ""),
      last_name: Joi.string().escapeHTML().optional().allow(null, ""),
      email: Joi.string().escapeHTML().email().optional().allow(null, ""),
    })
      .optional()
      .allow(null),
  });
  return schema.validate(data);
};

export const validateUpdateMultipleBookingsSchema = (data: any) => {
  const schema = Joi.object({
    booked_user: Joi.string().escapeHTML().optional().allow(null),
    space: Joi.string().escapeHTML().optional().allow(null),
    venue: Joi.string().escapeHTML().optional().allow(null),
    start_date: Joi.alternatives().try(Joi.string().escapeHTML(), Joi.array().items(Joi.string().escapeHTML())).optional().allow(null),
    start_time: Joi.string().escapeHTML().optional().allow(null),
    end_time: Joi.string().escapeHTML().optional().allow(null),
    total_guest: Joi.number().optional().allow(null),
    total_price: Joi.number().optional().allow(null),
    status: Joi.string().escapeHTML().valid("CONFIRMED", "PENDING", "CANCELLED").optional().allow(null),
    event_type: Joi.string().escapeHTML().optional().allow(null),
    repeat_event: Joi.string()
      .escapeHTML()
      .valid(...Object.values(RepeatEvent))
      .optional()
      .allow(null),
    event_duration: Joi.string()
      .escapeHTML()
      .valid(...Object.values(EventDuration))
      .optional()
      .allow(null),
    optional_input: Joi.object({
      first_name: Joi.string().escapeHTML().optional().allow(null, ""),
      last_name: Joi.string().escapeHTML().optional().allow(null, ""),
      email: Joi.string().escapeHTML().email().optional().allow(null, ""),
    })
      .optional()
      .allow(null),
  });

  return schema.validate(data);
};

export const validateCancelBookingSchema = (data: any) => {
  const schema = Joi.object({
    reason_for_cancellation: Joi.string()
      .escapeHTML()
      .valid(...Object.values(CancellationReason))
      .optional(),
    message: Joi.string().escapeHTML().optional(),
  }).optional();

  return schema.validate(data);
};
export const validateExisitingBookingSchema = (data: any) => {
  const schema = Joi.object({
    space: Joi.string().escapeHTML().required(),
    start_date: Joi.string().escapeHTML().required(),
    start_time: Joi.string().escapeHTML().optional().allow(null, ""),
    end_time: Joi.string().escapeHTML().optional().allow(null, ""),
    repeat_event: Joi.string()
      .escapeHTML()
      .valid(...Object.values(RepeatEvent))
      .optional()
      .allow(null, ""),
  });

  return schema.validate(data);
};
