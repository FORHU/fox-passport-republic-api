// Type definitions for Prisma enums and extended types
// Import Prisma enums
import { UserRole, EventStatus, BookingStatus, PaymentStatus } from "@prisma/client";

// Re-export Prisma enums for convenience
export { UserRole, EventStatus, BookingStatus, PaymentStatus };

// User type from JWT
export interface JWTUser {
    userId: string;
    role: string; // Will be one of the UserRole enum values
    email?: string;
}
