const indexes = [
  {
    key: { action: -1 },
  },
  {
    key: { "details.space": -1 },
  },
  {
    key: { user: -1 },
  },
  {
    key: { "details.venue": -1 },
  },
];

export const createUserLogsIndex = async (db: any) => {
  const indexPromises = indexes.map((index) => {
    return db.collection("user-logs").createIndex(index.key);
  });

  return Promise.allSettled(indexPromises);
};
