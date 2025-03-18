const indexes = [{ key: { receiver: -1 } }];

export const createNotificationIndex = async (db: any) => {
  const indexPromises = indexes.map((index) => {
    return db.collection("notification").createIndex(index.key);
  });

  return Promise.allSettled(indexPromises);
};
