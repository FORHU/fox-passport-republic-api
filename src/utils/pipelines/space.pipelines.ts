// eslint-disable-next-line import/named
import { TSpaceProjectPayload } from "../../types/space";
import {
  getCancellationPolicyProjection,
  getUserProjection,
  getVenueProjection,
  getKeywordsProjection,
  getQuestionsProjection,
  getFilesProjection,
} from "../projection/project";

export const INITIAL_SORT = { $sort: { _id: -1 } };

export const USER_LOOKUP = (fields = []) => ({
  $lookup: {
    from: "users",
    localField: "user",
    foreignField: "_id",
    pipeline: [getUserProjection(fields)],
    as: "user",
  },
});

export const USER_SET = {
  $set: {
    user: {
      $ifNull: [{ $first: "$user" }, null],
    },
  },
};

// START Venue lookup, set

export const VENUE_LOOKUP = (fields = []) => ({
  $lookup: {
    from: "venues",
    localField: "venue",
    foreignField: "_id",
    pipeline: [getVenueProjection(fields)],
    as: "venue",
  },
});

export const VENUE_SET = {
  $set: {
    venue: {
      $ifNull: [
        {
          $first: "$venue",
        },
        null,
      ],
    },
  },
};

// END Venue lookup, set

// START Cancellation Policy lookup, set

export const CANCELLATION_LOOKUP = (fields = []) => ({
  $lookup: {
    from: "cancellation-policies",
    localField: "venue.cancellation_policy",
    foreignField: "_id",
    pipeline: [getCancellationPolicyProjection(fields)],
    as: "venue.cancellation_policy",
  },
});

export const CANCELLATION_POLICY_SET = {
  $set: {
    "venue.cancellation_policy": {
      $ifNull: [
        {
          $first: "$venue.cancellation_policy",
        },
        null,
      ],
    },
  },
};

// END Cancellation Policy lookup, set

// START Venue keywords lookup

export const VENUE_KEYWORDS_LOOKUP = (fields = []) => ({
  $lookup: {
    from: "keywords",
    localField: "venue.keywords",
    foreignField: "_id",
    pipeline: [getKeywordsProjection(fields)],
    as: "venue.keywords",
  },
});

// END Venue keywords lookup

// START Venue details lookup

export const VENUE_DETAILS_LOOKUP = (fields = []) => ({
  $lookup: {
    from: "questions",
    localField: "venue.venue_details",
    foreignField: "_id",
    pipeline: [getQuestionsProjection(fields)],
    as: "venue.venue_details",
  },
});

// END Venue details lookup

// START Venue photo lookup, sort, and unset

export const VENUE_PHOTO_LOOKUP_AS_VENUE_PHOTOS = (fields = []) => ({
  $lookup: {
    from: "files",
    localField: "venue_photo",
    foreignField: "_id",
    pipeline: [getFilesProjection(fields)],
    as: "venue_photos",
  },
});

export const VENUE_PHOTOS_SORT = {
  $sort: {
    "venue_photos.createdAt": -1,
  },
};

export const VENUE_PHOTO_UNSET = { $unset: "venue_photo" };

// END Venue photo lookup, sort, and unset

// START Space photo, lookup, sort, unset

export const SPACE_PHOTO_LOOKUP_AS_SPACE_PHOTOS = (fields = []) => ({
  $lookup: {
    from: "files",
    localField: "space_photo",
    foreignField: "_id",
    pipeline: [getFilesProjection(fields)],
    as: "space_photos",
  },
});

export const SPACE_PHOTOS_SORT = {
  $sort: {
    "space_photos.createdAt": -1,
  },
};

export const SPACE_PHOTO_UNSET = { $unset: "space_photo" };

// END Space photo, lookup, sort, unset

// START Capacity Layout lookup

export const CAPACITY_LAYOUT_LOOKUP = (fields = []) => ({
  $lookup: {
    from: "questions",
    localField: "capacity_layout",
    foreignField: "_id",
    pipeline: [getQuestionsProjection(fields)],
    as: "capacity_layout",
  },
});

// END Capacity Layout lookup

export const FLOOR_PLAN_LOOKUP = (fields = []) => ({
  $lookup: {
    from: "files",
    localField: "floor_plan",
    foreignField: "_id",
    pipeline: [getFilesProjection(fields)],
    as: "floor_plan",
  },
});

export const FEATURES_LOOKUP = (fields = []) => ({
  $lookup: {
    from: "questions",
    localField: "features",
    foreignField: "_id",
    pipeline: [getQuestionsProjection(fields)],
    as: "features",
  },
});

export const KEYWORDS_LOOKUP = (fields = []) => ({
  $lookup: {
    from: "keywords",
    localField: "keywords",
    foreignField: "_id",
    pipeline: [getKeywordsProjection(fields)],
    as: "keywords",
  },
});

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
