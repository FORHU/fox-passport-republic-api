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
    as: "space_photo",
  },
};

export const createPaginationStages = (skip: number, limit: number) => [
  {
    $skip: skip,
  },
  {
    $limit: limit,
  },
  {
    $sort: {
      created_at: -1,
    },
  },
];

export const GET_SPACES_PROJECT = {
  $project: {
    _id: 1,
    name: 1,
    status: 1,
    user: {
      _id: 1,
      first_name: 1,
      last_name: 1,
      organization: 1,
    },
    venue: {
      _id: 1,
      name: 1,
      address: 1,
      tenant: 1,
    },
    space_photo: {
      _id: 1,
      path: 1,
      contentType: 1,
      filename: 1,
    },
  },
};
