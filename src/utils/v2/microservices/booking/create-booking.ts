import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";

import { BOOKING_URL } from "../../../../config";

const PROTO_PATH = path.resolve(process.cwd(), "proto/create-booking.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const createBookingProto = protoDescriptor.booking;

const client = new createBookingProto.CreateBookingService(BOOKING_URL, grpc.credentials.createInsecure());

export const handleInitCreateBooking = (data: any) => {
  return new Promise<void>((resolve, reject) => {
    client.InitCreateBooking(data, (error: grpc.ServiceError | null, response: any) => {
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
