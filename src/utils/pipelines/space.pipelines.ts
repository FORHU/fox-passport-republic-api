// eslint-disable-next-line import/named
import { TSpaceProjectPayload } from "../../types/space";

export const INITIAL_SORT = { $sort: { _id: -1 } };

export const USER_LOOKUP = {
  $lookup: {
    from: "users",
    localField: "user",
    foreignField: "_id",
    pipeline: [
      {
        $project: {
          first_name: 1,
          last_name: 1,
          phone_number: 1,
          email: 1,
          date_of_birth: 1,
          country: 1,
          organization: 1,
          social_link: 1,
          company_name: 1,
          role: 1,
        },
      },
    ],
    as: "user",
  },
};

export const USER_SET = {
  $set: {
    user: {
      $ifNull: [{ $first: "$user" }, null],
    },
  },
};

// START Venue lookup, set

export const VENUE_LOOKUP = {
  $lookup: {
    from: "venues",
    localField: "venue",
    foreignField: "_id",
    pipeline: [
      {
        $project: {
          name: 1,
          representation: 1,
          description: 1,
          address: 1,
          cancellation_policy: 1,
          keywords: 1,
          status: 1,
          age_restriction: 1,
          venue_details: 1,
        },
      },
    ],
    as: "venue",
  },
};

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

export const CANCELLATION_LOOKUP = {
  $lookup: {
    from: "cancellation-policies",
    localField: "venue.cancellation_policy",
    foreignField: "_id",
    pipeline: [
      {
        $project: {
          venue_id: 0,
          updatedAt: 0,
          createdAt: 0,
        },
      },
    ],
    as: "venue.cancellation_policy",
  },
};

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

export const VENUE_KEYWORDS_LOOKUP = {
  $lookup: {
    from: "keywords",
    localField: "venue.keywords",
    foreignField: "_id",
    pipeline: [
      {
        $project: {
          keyword: 1,
          categories: {
            $arrayElemAt: ["$categories", 0],
          },
        },
      },
    ],
    as: "venue.keywords",
  },
};

// END Venue keywords lookup

// START Venue details lookup

export const VENUE_DETAILS_LOOKUP = {
  $lookup: {
    from: "questions",
    localField: "venue.venue_details",
    foreignField: "_id",
    pipeline: [
      {
        $project: {
          question: 1,
          reference: 1,
          answer: 1,
          options: 1,
        },
      },
    ],
    as: "venue.venue_details",
  },
};

// END Venue details lookup

// START Venue photo lookup, sort, and unset

export const VENUE_PHOTO_LOOKUP_AS_VENUE_PHOTOS = {
  $lookup: {
    from: "files",
    localField: "venue_photo",
    foreignField: "_id",
    pipeline: [
      {
        $project: {
          filename: 1,
          path: 1,
          createdAt: 1,
        },
      },
    ],
    as: "venue_photos",
  },
};

export const VENUE_PHOTOS_SORT = {
  $sort: {
    "venue_photos.createdAt": -1,
  },
};

export const VENUE_PHOTO_UNSET = { $unset: "venue_photo" };

// END Venue photo lookup, sort, and unset

// START Space photo, lookup, sort, unset

export const SPACE_PHOTO_LOOKUP_AS_SPACE_PHOTOS = {
  $lookup: {
    from: "files",
    localField: "space_photo",
    foreignField: "_id",
    pipeline: [
      {
        $project: {
          filename: 1,
          path: 1,
          createdAt: 1,
        },
      },
    ],
    as: "space_photos",
  },
};

export const SPACE_PHOTOS_SORT = {
  $sort: {
    "space_photos.createdAt": -1,
  },
};

export const SPACE_PHOTO_UNSET = { $unset: "space_photo" };

// END Space photo, lookup, sort, unset

// START Capacity Layout lookup

export const CAPACITY_LAYOUT_LOOKUP = {
  $lookup: {
    from: "questions",
    localField: "capacity_layout",
    foreignField: "_id",
    pipeline: [
      {
        $project: {
          question: 1,
          reference: 1,
          answer: 1,
          options: 1,
        },
      },
    ],
    as: "capacity_layout",
  },
};

// END Capacity Layout lookup

export const FLOOR_PLAN_LOOKUP = {
  $lookup: {
    from: "files",
    localField: "floor_plan",
    foreignField: "_id",
    pipeline: [
      {
        $project: {
          filename: 1,
          path: 1,
          createdAt: 1,
        },
      },
    ],
    as: "floor_plan",
  },
};

export const FEATURES_LOOKUP = {
  $lookup: {
    from: "questions",
    localField: "features",
    foreignField: "_id",
    pipeline: [
      {
        $project: {
          question: 1,
          reference: 1,
          answer: 1,
          options: 1,
        },
      },
    ],
    as: "features",
  },
};

export const KEYWORDS_LOOKUP = {
  $lookup: {
    from: "keywords",
    localField: "keywords",
    foreignField: "_id",
    pipeline: [
      {
        $project: {
          keyword: 1,
          categories: {
            $arrayElemAt: ["$categories", 0],
          },
        },
      },
    ],
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
    as: "bookings",
  },
};

export const createSpacesProject = ({
  _id,
  status,
  space_details_name,
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
