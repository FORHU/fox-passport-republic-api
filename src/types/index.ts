import {
    UserRole,
    VenueStatus,
    EventStatus,
    BookingStatus,
    PaymentStatus
} from "@prisma/client";

export interface JWTUser {
    id: string;
    email: string;
    role: UserRole;
    isHost: boolean;
}

export { UserRole, VenueStatus, EventStatus, BookingStatus, PaymentStatus };