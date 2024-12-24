const indexes = [
  {
    key: { email: -1 },
    unique: true,
  },
];

export const createUserIndex = async (db: any) => {
  const indexPromises = indexes.map((index) => {
    const options = index.unique ? { unique: true } : {};
    return db.collection("users").createIndex(index.key, options);
  });

  return Promise.allSettled(indexPromises);
};
