import crypto from 'crypto';

/**
 * OTP UTILITIES
 * Reusable functions for One-Time Password operations
 * Used for: Email verification, phone verification, password reset
 */

export const generateOTP = (): string => {
    const otp = Math.floor(100000 + Math.random() * 900000);
    return otp.toString().padStart(6, '0');
};

export const getOTPExpiry = (): Date => {
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 5);
    return expiry;
};

export const isOTPExpired = (expiry: Date | null): boolean => {
    if (!expiry) return true;
    return new Date() > expiry;
};