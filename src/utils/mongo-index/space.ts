const indexes = [
  {
    key: { features: -1 },
  },
  {
    key: { venue: -1 },
  },
  {
    key: { "guest_capacity.maximum": -1 },
  },
  {
    key: { capacity_layout: -1 },
  },
  {
    key: { name: -1 },
  },
  {
    key: { status: -1 },
  },
  {
    key: { keywords: -1 },
  },
  {
    key: { space_photo: -1 },
  },
  {
    key: { venue_photo: -1 },
  },
  {
    key: { floor_plan: -1 },
  },
  {
    key: { pricing: -1 },
  },
];

export const createSpaceIndex = async (db: any) => {
  const indexPromises = indexes.map((index) => {
    return db.collection("spaces").createIndex(index.key);
  });
  return Promise.allSettled(indexPromises);
};
