import { Prisma } from "@prisma/client";

export type EventWithRelations = Prisma.EventGetPayload<{
  include: {
    host: { select: { id: true; name: true } };
    template: true;
    assetTransactions: { include: { asset: true } };
    serviceTransactions: { include: { service: true } };
    venueTransactions: { include: { venue: true } };
  };
}>;

export type BookingWithRelations = Prisma.BookingGetPayload<{
  include: {
    event: {
      include: {
        host: { select: { id: true; name: true } };
      };
    };
    user: { select: { id: true; name: true; email: true } };
    attendees: {
      include: {
        invitedBy: { select: { id: true; name: true } };
      };
    };
    payments: true;
    assetTransactions: true;
    serviceTransactions: true;
    venueTransactions: {
      include: {
        venue: true;
      };
    };
  };
}>;

export type BookingAttendeeWithRelations = Prisma.BookingAttendeeGetPayload<{
  include: {
    booking: true;
  };
}>;
