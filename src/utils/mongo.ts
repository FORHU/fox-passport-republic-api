import { Db, MongoClient, TransactionOptions } from "mongodb";

import { isTest, MONGO_DB, MONGO_URI } from "../config";
import { InitializeCreateIndex } from "./mongo-index";

let db: Db;
let mongoClient: MongoClient;

export const connectToMongo = async () => {
  if (isTest) return;
  const client = new MongoClient(MONGO_URI, { maxPoolSize: 10, maxIdleTimeMS: 60000, connectTimeoutMS: 60000 });

  await client.connect();
  db = client.db(MONGO_DB);
  mongoClient = client;
  await InitializeCreateIndex(db);
};

export const getDB = () => {
  if (!db) {
    throw new Error("Database not connected!");
  }
  return db;
};

export const useMongoClient = () => {
  return mongoClient;
};

export const useTransactionOptions: TransactionOptions = {
  readPreference: "primary",
  readConcern: { level: "local" },
  writeConcern: { w: "majority" },
};

export const closeDB = async () => {
  if (mongoClient) {
    await mongoClient.close();
    console.log("MongoDB connection closed");
  }
};
