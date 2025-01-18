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

export const createMatchStages = (query: any) => [
  {
    $match: query,
  },
];
