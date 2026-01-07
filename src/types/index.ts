import { UserRole, ListingStatus, BookingStatus, PaymentStatus } from "@prisma/client";

export interface JWTUser {
    id: string;
    email: string;
    role: UserRole;
    isHost: boolean;
}

export { UserRole, ListingStatus, BookingStatus, PaymentStatus };