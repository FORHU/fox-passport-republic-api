import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { ObjectId, UpdateResult } from "mongodb";
import path from "path";

import { BOOKING_URL } from "../../../../config";

const PROTO_PATH = path.resolve(process.cwd(), "proto/delete-booking.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const deleteBookingProto = protoDescriptor.booking;

const client = new deleteBookingProto.DeleteBookingService(BOOKING_URL, grpc.credentials.createInsecure());

export const handleInitDeleteBooking = (booking_id: ObjectId, deletedBy: ObjectId) => {
  return new Promise<UpdateResult>((resolve, reject) => {
    client.InitDeleteBooking({ booking_id, deletedBy }, (error: grpc.ServiceError | null, response: any) => {
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
