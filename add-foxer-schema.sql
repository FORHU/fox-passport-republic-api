-- Add Foxer Profile table and related tables
-- This extends the User model for users with foxer role

-- Foxer Status enum
CREATE TYPE "FoxerStatus" AS ENUM ('online', 'offline', 'away');

-- Main Foxer Profile table
CREATE TABLE IF NOT EXISTS "foxer_profiles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "role" VARCHAR(255) NOT NULL, -- e.g., "Event Stylist", "Adventure Guide"
  "bio" TEXT,
  "rating" DECIMAL(3, 2) DEFAULT 0.00,
  "reviewCount" INTEGER DEFAULT 0,
  "status" "FoxerStatus" DEFAULT 'offline',
  "isVerified" BOOLEAN DEFAULT false,
  "specialties" TEXT[], -- Array of specialty tags
  "hourlyRate" DECIMAL(10, 2),
  "currency" VARCHAR(10) DEFAULT 'PHP',
  "location" VARCHAR(255),
  "availableFrom" TIMESTAMP,
  "availableTo" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Foxer Gallery/Portfolio images
CREATE TABLE IF NOT EXISTS "foxer_gallery" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "foxerId" UUID NOT NULL REFERENCES "foxer_profiles"("id") ON DELETE CASCADE,
  "imageUrl" TEXT NOT NULL,
  "caption" VARCHAR(255),
  "displayOrder" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Foxer Skills/Tags
CREATE TABLE IF NOT EXISTS "foxer_skills" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "foxerId" UUID NOT NULL REFERENCES "foxer_profiles"("id") ON DELETE CASCADE,
  "skillName" VARCHAR(100) NOT NULL,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Foxer Reviews (separate from general reviews)
CREATE TABLE IF NOT EXISTS "foxer_reviews" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "foxerId" UUID NOT NULL REFERENCES "foxer_profiles"("id") ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "bookingId" UUID, -- Optional reference to booking
  "rating" INTEGER NOT NULL CHECK ("rating" >= 1 AND "rating" <= 5),
  "comment" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "idx_foxer_profiles_userId" ON "foxer_profiles"("userId");
CREATE INDEX IF NOT EXISTS "idx_foxer_profiles_status" ON "foxer_profiles"("status");
CREATE INDEX IF NOT EXISTS "idx_foxer_profiles_rating" ON "foxer_profiles"("rating");
CREATE INDEX IF NOT EXISTS "idx_foxer_gallery_foxerId" ON "foxer_gallery"("foxerId");
CREATE INDEX IF NOT EXISTS "idx_foxer_skills_foxerId" ON "foxer_skills"("foxerId");
CREATE INDEX IF NOT EXISTS "idx_foxer_reviews_foxerId" ON "foxer_reviews"("foxerId");
