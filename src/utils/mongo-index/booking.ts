const indexes = [
  {
    key: { space: -1 },
  },
];

export const createBookingIndex = async (db: any) => {
  const indexPromises = indexes.map((index) => {
    return db.collection("bookings").createIndex(index.key);
  });

  return Promise.allSettled(indexPromises);
};
