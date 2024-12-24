import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { ObjectId, UpdateResult } from "mongodb";
import path from "path";

import { BOOKING_URL } from "../../../../config";

const PROTO_PATH = path.resolve(process.cwd(), "proto/update-booking.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const updateBookingProto = protoDescriptor.booking;

const client = new updateBookingProto.UpdateBookingService(BOOKING_URL, grpc.credentials.createInsecure());

export const handleInitUpdateBooking = (booking_id: ObjectId, updateData: any) => {
  return new Promise<UpdateResult>((resolve, reject) => {
    client.InitUpdateBooking({ booking_id, data: updateData }, (error: grpc.ServiceError | null, response: any) => {
      if (error) {
        console.error("Error:", error.message);
        reject(error);
      } else {
        console.log("Response:", response);
        resolve(response.results);
      }
    });
  });
};
