export type ProjectFields = {
  venueDetailsProject?: questionProjectAllowedValues[];
  capacityLayoutProject?: questionProjectAllowedValues[];
  featuresProject?: questionProjectAllowedValues[];
  venuePhotosProject?: fileProjectAllowedValues[];
  spacePhotosProject?: fileProjectAllowedValues[];
  floorPlanProject?: fileProjectAllowedValues[];
  venueKeywordsProject?: keywordsProjectAllowedValues[];
  keywordsProject?: keywordsProjectAllowedValues[];
  userProject?: userProjectAllowedValues[];
  venueProject?: venueProjectAllowedValues[];
  pricingProject?: pricingProjectAllowedValues[];
  cancellationPolicyProject?: cancellationPolicyProjectAllowedValues[];
  bookingProject?: bookingProjectAllowedValues[];
  finalProject?: finalProjectAllowedValues[];
};

export const getUserProjection = (fields = []) => {
  if (fields.length === 0) {
    fields = ["first_name", "last_name", "phone_number", "email", "date_of_birth", "country", "organization", "social link", "company_name", "role"];
  }

  return {
    $project: fields.reduce((acc, field) => {
      acc[field] = 1;
      return acc;
    }, {}),
  };
};

export const getVenueProjection = (fields = []) => {
  if (fields.length === 0) {
    fields = ["name", "representation", "description", "address", "cancellation_policy", "keywords", "status", "age_restriction", "venue_details"];
  }

  return {
    $project: fields.reduce((acc, field) => {
      acc[field] = 1;
      return acc;
    }, {}),
  };
};

export const getCancellationPolicyProjection = (fields = []) => {
  if (fields.length === 0) {
    fields = ["allow_rescheduling", "description", "policy"];
  }

  return {
    $project: fields.reduce((acc, field) => {
      acc[field] = 1;
      return acc;
    }, {}),
  };
};

export const getKeywordsProjection = (fields = []) => {
  if (fields.length === 0) {
    fields = ["keyword"];
  }

  return {
    $project: {
      ...fields.reduce((acc, field) => {
        acc[field] = 1;
        return acc;
      }, {}),
      categories: { $arrayElemAt: ["$categories", 0] },
    },
  };
};

export const getQuestionsProjection = (fields = []) => {
  if (fields.length === 0) {
    fields = ["question", "reference", "answer", "option"];
  }

  return {
    $project: fields.reduce((acc, field) => {
      acc[field] = 1;
      return acc;
    }, {}),
  };
};

export const getFilesProjection = (fields = []) => {
  if (fields.length === 0) {
    fields = ["filename", "path", "craetedAt"];
  }

  return {
    $project: fields.reduce((acc, field) => {
      acc[field] = 1;
      return acc;
    }, {}),
  };
};

export const getPricingProjection = (fields = []) => {
  if (fields.length === 0) {
    fields = ["selected_pricing", "currency", "hire_fee", "custom_price", "cleaning_fee"];
  }

  if (!fields.includes("selected_pricing")) {
    fields.push("selected_pricing");
  }

  return {
    $project: {
      ...fields.reduce((acc, field) => {
        acc[field] = 1;
        return acc;
      }, {}),
      hire_fee: {
        $cond: {
          if: { $eq: ["$selected_pricing", "HIRE_FEE"] },
          then: 1,
          else: 0,
        },
      },
      custom_price: {
        $cond: {
          if: { $eq: ["$selected_pricing", "CUSTOM_PRICE"] },
          then: 1,
          else: 0,
        },
      },
    },
  };
};

export const getBookingProjection = (fields = []) => {
  if (fields.length === 0) {
    fields = [
      "booker",
      "booked_user",
      "enquiry",
      "reason_for_cancellation",
      "message",
      "start_date",
      "end_date",
      "total_guest",
      "total_price",
      "status",
      "refund_data",
      "event_type",
      "optional_input",
      "repeat_event",
      "event_duration",
      "cancelledAt",
      "cancelledBy",
    ];
  }

  return {
    $project: fields.reduce((acc, field) => {
      acc[field] = 1;
      return acc;
    }, {}),
  };
};

export const removeNullFieldsInBookingProjection = {
  $addFields: {
    enquiry: {
      $cond: {
        if: {
          $eq: ["$enquiry", null],
        },
        then: "$$REMOVE",
        else: "$enquiry",
      },
    },
    total_guest: {
      $cond: {
        if: {
          $eq: ["$total_guest", null],
        },
        then: "$$REMOVE",
        else: "$total_guest",
      },
    },
    reason_for_cancellation: {
      $cond: {
        if: {
          $eq: ["$reason_for_cancellation", null],
        },
        then: "$$REMOVE",
        else: "$reason_for_cancellation",
      },
    },
    message: {
      $cond: {
        if: { $eq: ["$message", null] },
        then: "$$REMOVE",
        else: "$message",
      },
    },
    optional_input: {
      $cond: {
        if: {
          $eq: ["$optional_input", null],
        },
        then: "$$REMOVE",
        else: "$optional_input",
      },
    },
    repeat_event: {
      $cond: {
        if: {
          $eq: ["$repeat_event", null],
        },
        then: "$$REMOVE",
        else: "$repeat_event",
      },
    },
    event_duration: {
      $cond: {
        if: {
          $eq: ["$event_duration", null],
        },
        then: "$$REMOVE",
        else: "$event_duration",
      },
    },
    refund_data: {
      $cond: {
        if: {
          $eq: ["$refund_data", null],
        },
        then: "$$REMOVE",
        else: "$refund_data",
      },
    },
    cancelledAt: {
      $cond: {
        if: {
          $eq: ["$cancelledAt", null],
        },
        then: "$$REMOVE",
        else: "$cancelledAt",
      },
    },
    cancelledBy: {
      $cond: {
        if: {
          $eq: ["$cancelledBy", null],
        },
        then: "$$REMOVE",
        else: "$cancelledBy",
      },
    },
  },
};

export const getFinalProjection = (fields = []) => {
  if (fields.length === 0) {
    fields = [
      "venue",
      "user",
      "status",
      "name",
      "type",
      "representation",
      "description",
      "capacity_layout",
      "guest_capacity",
      "floor_plan",
      "features",
      "keywords",
      "pricing",
      "venue_photos",
      "space_photos",
      "bookings",
    ];
  }

  return {
    $project: fields.reduce((acc, field) => {
      acc[field] = 1;
      return acc;
    }, {}),
  };
};

export type userProjectAllowedValues =
  | "_id"
  | "first_name"
  | "last_name"
  | "phone_number"
  | "email"
  | "date_of_birth"
  | "country"
  | "organization"
  | "social link"
  | "company_name"
  | "role";

export type venueProjectAllowedValues =
  | "_id"
  | "name"
  | "representation"
  | "description"
  | "address"
  | "cancellation_policy"
  | "keywords"
  | "status"
  | "age_restriction"
  | "venue_details";

export type cancellationPolicyProjectAllowedValues = "_id" | "allow_rescheduling" | "description" | "policy";

export type keywordsProjectAllowedValues = "_id" | "keyword";

export type questionProjectAllowedValues = "_id" | "question" | "reference" | "answer" | "option";

export type fileProjectAllowedValues = "_id" | "filename" | "path" | "craetedAt";

export type pricingProjectAllowedValues = "_id" | "selected_pricing" | "currency" | "hire_fee" | "custom_price" | "cleaning_fee";

export type bookingProjectAllowedValues =
  | "_id"
  | "booker"
  | "booked_user"
  | "enquiry"
  | "reason_for_cancellation"
  | "message"
  | "start_date"
  | "end_date"
  | "total_guest"
  | "total_price"
  | "status"
  | "refund_data"
  | "event_type"
  | "optional_input"
  | "repeat_event"
  | "event_duration"
  | "cancelledAt"
  | "cancelledBy";

export type finalProjectAllowedValues =
  | "_id"
  | "venue"
  | "user"
  | "status"
  | "name"
  | "type"
  | "representation"
  | "description"
  | "capacity_layout"
  | "guest_capacity"
  | "floor_plan"
  | "features"
  | "keywords"
  | "pricing"
  | "venue_photos"
  | "space_photos"
  | "bookings";
