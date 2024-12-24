const indexes = [
  {
    key: { features: -1 },
  },
  {
    key: { venue_details: -1 },
  },
  {
    key: { address: -1 },
  },
  {
    key: { organization: -1 },
  },
  {
    key: { cancellation_policy: -1 },
  },
  {
    key: { age_restriction: -1 },
  },
  {
    key: { foods_and_beverages: -1 },
  },
  {
    key: { status: -1 },
  },
  {
    key: { name_lower_case: -1 },
    unique: true,
  },
];

export const createVenueIndex = async (db: any) => {
  const indexPromises = indexes.map((index) => {
    const options = index?.unique ? { unique: true } : {};
    return db.collection("venues").createIndex(index.key, options);
  });
  return Promise.allSettled(indexPromises);
};
