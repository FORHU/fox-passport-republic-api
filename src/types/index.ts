import {
    UserRole,
    VenueStatus,
    EventStatus,
    BookingStatus,
    PaymentStatus,
    RentalStatus
} from "@prisma/client";

export interface JWTUser {
    id: string;
    email: string;
    role: UserRole;
    isHost: boolean;
}

export { UserRole, VenueStatus, EventStatus, BookingStatus, PaymentStatus, RentalStatus };