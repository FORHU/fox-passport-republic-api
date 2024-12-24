import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";

import { ENQUIRY_URL } from "../../../../config";

const PROTO_PATH = path.resolve(process.cwd(), "proto/create-enquiry.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const createEnquiryProto = protoDescriptor.enquiry;

const client = new createEnquiryProto.CreateEnquiryService(ENQUIRY_URL, grpc.credentials.createInsecure());

export const handleInitCreateEnquiry = (payload: any) => {
  return new Promise<void>((resolve, reject) => {
    payload.date.timestamp.start_date_time = new Date(payload.date.timestamp.start_date_time).toISOString();
    payload.date.timestamp.end_date_time = new Date(payload.date.timestamp.end_date_time).toISOString();
    client.InitCreateEnquiry(payload, (error: grpc.ServiceError | null, response: any) => {
      if (error) {
        console.error("Error:", error.message);
        reject(error);
      } else {
        console.log("Response:", response);
        resolve(response);
      }
    });
  });
};
