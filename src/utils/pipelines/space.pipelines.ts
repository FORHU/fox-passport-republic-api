// eslint-disable-next-line import/named
import { ObjectId } from "mongodb";
import { TSpaceProjectPayload } from "../../types/space";
import {
  getCancellationPolicyProjection,
  getUserProjection,
  getVenueProjection,
  getKeywordsProjection,
  getQuestionsProjection,
  getFilesProjection,
  getPricingProjection,
  getBookingProjection,
  removeNullFieldsInBookingProjection,
  getFinalProjection,
} from "../projection/project";

export const INITIAL_SPACE_PROJECTION = {
  $project: {
    venue: 1,
    user: 1,
    status: 1,
    name: 1,
    type: 1,
    representation: 1,
    description: 1,
    space_photo: 1,
    venue_photo: 1,
    capacity_layout: 1,
    guest_capacity: 1,
    floor_plan: 1,
    features: 1,
    keywords: 1,
    pricing: 1,
  },
};

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

export const PRICING_LOOKUP = (fields = []) => ({
  $lookup: {
    from: "pricing",
    localField: "_id",
    foreignField: "space_id",
    pipeline: [getPricingProjection(fields)],
    as: "pricing",
  },
});

export const PRICING_SET = {
  $set: {
    pricing: {
      $ifNull: [{ $first: "$pricing" }, null],
    },
  },
};

export const FAVORITE_LOOKUP = (userId: ObjectId) => ({
  $lookup: {
    from: "favorites",
    localField: "_id",
    foreignField: "space",
    pipeline: [
      {
        $match: {
          user: userId,
        },
      },
      {
        $project: {
          marked_as_favorite: 1,
          _id: 0,
        },
      },
    ],
    as: "marked_as_favorite",
  },
});

export const FAVORITE_SET = {
  $set: {
    marked_as_favorite: {
      $ifNull: [
        {
          $first: "$marked_as_favorite.marked_as_favorite",
        },
        false,
      ],
    },
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

export const BOOKING_LOOKUP = (fields = []) => ({
  $lookup: {
    from: "bookings",
    localField: "_id",
    foreignField: "space",
    pipeline: [getBookingProjection(fields), removeNullFieldsInBookingProjection],
    as: "bookings",
  },
});

export const FINAL_PROJECTION = (fields = []) => ({
  ...getFinalProjection(fields),
});

export const createSpacesProject = ({
  _id,
  status,
  space_details_name,
  type,
  representation,
  space_details_description,
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
      ...(space_details_name && { name: space_details_name }),
      ...(type && { type }),
      ...(representation && { representation }),
      ...(space_details_description && { description: space_details_description }),
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
