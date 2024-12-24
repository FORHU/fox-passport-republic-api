import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";

import { BOOKING_URL } from "../../../../config";

const PROTO_PATH = path.resolve(process.cwd(), "proto/existing-booking.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const existingBookingProto = protoDescriptor.booking;

const client = new existingBookingProto.BookingService(BOOKING_URL, grpc.credentials.createInsecure());

export const handleInitExistingBooking = (payload: any): any => {
  return new Promise((resolve, reject) => {
    const { space_id, booking_id, start_date, end_date } = payload;
    const request = {
      space_id,
      booking_id,
      start_date: start_date.toISOString(),
      end_date: end_date.toISOString(),
    };
    client.GetExistingBookings(request, (error: grpc.ServiceError | null, response: any) => {
      if (error) {
        console.error("Error:", error.message);
        reject(error);
      } else {
        resolve(response.is_existing_booking);
      }
    });
  });
};
