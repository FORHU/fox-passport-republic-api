const indexes = [
  {
    key: { space: -1 },
  },
  {
    key: { user: -1 },
  },
];

export const createFavoriteIndex = async (db: any) => {
  const indexPromises = indexes.map((index) => {
    return db.collection("favorites").createIndex(index.key);
  });

  return Promise.allSettled(indexPromises);
};
