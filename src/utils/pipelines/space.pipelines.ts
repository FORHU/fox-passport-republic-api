// eslint-disable-next-line import/named
import { TSpaceProjectPayload } from "../../types/space";

export const USER_LOOKUP = {
  $lookup: {
    from: "users",
    localField: "user",
    foreignField: "_id",
    as: "user",
  },
};

export const USER_UNWIND = {
  $unwind: "$user",
};

export const VENUE_LOOKUP = {
  $lookup: {
    from: "venues",
    localField: "venue",
    foreignField: "_id",
    as: "venue",
  },
};

export const VENUE_UNWIND = {
  $unwind: "$venue",
};

export const SPACE_PHOTO_LOOKUP = {
  $lookup: {
    from: "files",
    localField: "space_photo",
    foreignField: "_id",
    pipeline: [{ $project: { filename: 1, path: 1, description: 1 } }],
    as: "space_photo",
  },
};

export const VENUE_PHOTO_LOOKUP = {
  $lookup: {
    from: "files",
    localField: "venue_photo",
    foreignField: "_id",
    pipeline: [{ $project: { filename: 1, path: 1, description: 1 } }],
    as: "venue_photo",
  },
};

export const FLOOR_PLAN_LOOKUP = {
  $lookup: {
    from: "files",
    localField: "floor_plan",
    foreignField: "_id",
    as: "floor_plan",
  },
};

export const CAPACITY_LAYOUT_LOOKUP = {
  $lookup: {
    from: "questions",
    localField: "capacity_layout",
    foreignField: "_id",
    pipeline: [{ $project: { answer: 1, question: 1, max_capacity: 1, options: 1 } }],
    as: "capacity_layout",
  },
};

export const FEATURES_LOOKUP = {
  $lookup: {
    from: "features",
    localField: "features",
    foreignField: "_id",
    as: "features",
  },
};

export const KEYWORDS_LOOKUP = {
  $lookup: {
    from: "keywords",
    localField: "keywords",
    foreignField: "_id",
    pipeline: [{ $project: { keyword: 1, categories: { $arrayElemAt: ["$categories", 0] } } }],
    as: "keywords",
  },
};

export const GET_SPACES_RATING = {
  $lookup: {
    from: "ratings",
    localField: "_id",
    foreignField: "space",
    as: "ratings",
  },
};

export const BOOKING_LOOKUP = {
  $lookup: {
    from: "bookings",
    localField: "_id",
    foreignField: "space",
    pipeline: [
      {
        $project: {
          space: 0,
          venue: 0,
          createdAt: 0,
          updatedAt: 0,
          deletedAt: 0,
          deletedBy: 0,
          reason_for_cancellation: 0,
        },
      },
      {
        $addFields: {
          message: { $cond: { if: { $eq: ["$message", null] }, then: "$$REMOVE", else: "$message" } },
          optional_input: { $cond: { if: { $eq: ["$optional_input", null] }, then: "$$REMOVE", else: "$optional_input" } },
          repeat_event: { $cond: { if: { $eq: ["$repeat_event", null] }, then: "$$REMOVE", else: "$repeat_event" } },
          event_duration: { $cond: { if: { $eq: ["$event_duration", null] }, then: "$$REMOVE", else: "$event_duration" } },
          refund_data: { $cond: { if: { $eq: ["$refund_data", null] }, then: "$$REMOVE", else: "$refund_data" } },
          cancelledAt: { $cond: { if: { $eq: ["$cancelledAt", null] }, then: "$$REMOVE", else: "$cancelledAt" } },
          cancelledBy: { $cond: { if: { $eq: ["$cancelledBy", null] }, then: "$$REMOVE", else: "$cancelledBy" } },
        },
      },
    ],
    as: "bookings",
  },
};

export const createSpacesProject = ({
  _id,
  status,
  name,
  type,
  representation,
  description,
  space_photo,
  venue,
  pricing,
  capacity_layout,
  marked_as_favorite,
  rating,
  total_views,
  keywords,
  bookings,
}: TSpaceProjectPayload) => [
  {
    $project: {
      ...(_id && { _id }),
      ...(status && { status }),
      ...(name && { name }),
      ...(type && { type }),
      ...(representation && { representation }),
      ...(description && { description: description }),
      ...(space_photo && { space_photo }),
      ...(venue && { venue }),
      ...(pricing && { pricing }),
      ...(capacity_layout && { capacity_layout }),
      ...(marked_as_favorite && { marked_as_favorite }),
      ...(rating && { rating }),
      ...(total_views && { total_views }),
      ...(keywords && { keywords }),
      ...(bookings && { bookings }),
    },
  },
];
