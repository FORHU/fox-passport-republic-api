import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";

import { BOOKING_URL } from "../../../../config";

const PROTO_PATH = path.resolve(process.cwd(), "proto/existing-booking-details.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const existingBookingDetailsProto = protoDescriptor.booking;

const client = new existingBookingDetailsProto.BookingService(BOOKING_URL, grpc.credentials.createInsecure());

export const handleInitExistingBookingDetails = (payload: any): any => {
  return new Promise((resolve, reject) => {
    const { space_id, start_date, end_date } = payload;
    const request = {
      space_id,
      start_date: start_date.toISOString(),
      end_date: end_date.toISOString(),
    };
    client.GetExistingBookingDetails(request, (error: grpc.ServiceError | null, response: any) => {
      if (error) {
        console.error("Error:", error.message);
        reject(error);
      } else {
        resolve(response.bookings);
      }
    });
  });
};
