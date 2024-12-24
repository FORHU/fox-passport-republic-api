import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";

import { ENQUIRY_URL } from "../../../../config";

const PROTO_PATH = path.resolve(process.cwd(), "proto/get-enquiry.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const getEnquiryProto = protoDescriptor.enquiry;

const client = new getEnquiryProto.EnquiryService(ENQUIRY_URL, grpc.credentials.createInsecure());

export const handleInitGetEnquiry = (payload: any): Promise<{ enquiries: any[]; count: number }> => {
  return new Promise((resolve, reject) => {
    client.InitGetEnquiry(payload, (error: grpc.ServiceError | null, response: any) => {
      if (error) {
        console.error("Error:", error.message);
        reject(error);
      } else {
        const obj = {
          enquiries: response.enquiries || [],
          count: response.count,
        };
        resolve(obj);
      }
    });
  });
};
