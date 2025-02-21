export const createPaginationStages = (skip: number, limit: number) => [
  {
    $facet: {
      metadata: [{ $count: "total_items" }],
      data: [{ $skip: skip }, { $limit: limit }],
    },
  },
  {
    $addFields: {
      total_items: { $arrayElemAt: ["$metadata.total_items", 0] },
      data: "$data",
    },
  },
  {
    $addFields: {
      total_items: { $ifNull: ["$total_items", 0] },
      total_pages: {
        $ceil: {
          $divide: ["$total_items", limit],
        },
      },
      current_page: {
        $add: [{ $divide: [skip, limit] }, 1],
      },
      size: limit,
      offset: skip,
    },
  },
  {
    $project: {
      metadata: 0,
    },
  },
];

export const createMatchStages = (query: any) => [
  {
    $match: query,
  },
];
