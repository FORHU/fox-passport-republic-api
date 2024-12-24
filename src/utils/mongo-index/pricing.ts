const indexes = [
  {
    key: { hire_fee: -1 },
  },
  {
    key: { selected_pricing: -1 },
  },
  {
    key: { custom_price: -1 },
  },
];

export const createPricingIndex = async (db: any) => {
  const indexPromises = indexes.map((index) => {
    return db.collection("pricing").createIndex(index.key);
  });

  return Promise.allSettled(indexPromises);
};
