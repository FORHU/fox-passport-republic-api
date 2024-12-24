import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";

import { BOOKING_URL } from "../../../../config";

const PROTO_PATH = path.resolve(process.cwd(), "proto/get-booking.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const getBookingProto = protoDescriptor.booking;

const client = new getBookingProto.BookingService(BOOKING_URL, grpc.credentials.createInsecure());

export const handleInitGetBooking = ({ payload }: any): Promise<{ booking: any[]; count: number }> => {
  return new Promise((resolve, reject) => {
    client.GetBookings(payload, (error: grpc.ServiceError | null, response: any) => {
      if (error) {
        console.error("Error:", error.message);
        reject(error);
      } else {
        const obj = {
          booking: response.bookings || [],
          count: response.count,
        };
        resolve(obj);
      }
    });
  });
};
