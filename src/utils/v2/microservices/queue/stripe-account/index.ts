import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";

import { QUEUE_URL } from "../../../../../config";

const PROTO_PATH = path.resolve(process.cwd(), "proto/stripe-account.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const queueProto = protoDescriptor.queue;

const client = new queueProto.StripeAccountQueueService(QUEUE_URL, grpc.credentials.createInsecure());

export const handleInitStripeAccountQueue = () => {
  return new Promise<void>((resolve, reject) => {
    client.InitStripeAccountQueue({}, (error: grpc.ServiceError | null, response: any) => {
      if (error) {
        console.error("Error:", error.message);
        reject(error);
      } else {
        console.log("Response:", response);
        resolve();
      }
    });
  });
};
