import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";

import { QUEUE_URL } from "../../../../../config";

const PROTO_PATH = path.resolve(process.cwd(), "proto/enquiry.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const queueProto = protoDescriptor.queue;

const client = new queueProto.QueueService(QUEUE_URL, grpc.credentials.createInsecure());

export const handleInitEnquiriesQueue = () => {
  return new Promise<void>((resolve, reject) => {
    client.InitEnquiriesQueue({}, (error: grpc.ServiceError | null, response: any) => {
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
