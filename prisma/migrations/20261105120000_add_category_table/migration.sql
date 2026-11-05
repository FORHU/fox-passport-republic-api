-- The category catalog (BUG-19). A new table, so no existing rows are touched
-- and the previous app version, which never reads it, keeps working.

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "parentCategoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parentCategoryId_idx" ON "categories"("parentCategoryId");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentCategoryId_fkey" FOREIGN KEY ("parentCategoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed: the two groups, then one row per value the category enums hold today,
-- so the catalog starts in step with the listings. Slugs are unique, and
-- `other` appears in every enum: it is seeded once, under `event`, which is
-- where the category list has always grouped it. ON CONFLICT keeps a re-run
-- harmless.
INSERT INTO "categories" ("id", "slug", "name", "icon", "parentCategoryId", "updatedAt")
VALUES
    (gen_random_uuid()::text, 'event', 'Event', 'confirmation_number', NULL, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'listing', 'Listing', 'storefront', NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "categories" ("id", "slug", "name", "icon", "parentCategoryId", "updatedAt")
SELECT gen_random_uuid()::text, v.slug, v.name, v.icon, p."id", CURRENT_TIMESTAMP
FROM (VALUES
    -- EventCategory
    ('event', 'corporate', 'Corporate', 'business_center'),
    ('event', 'birthday', 'Birthday', 'cake'),
    ('event', 'wedding', 'Wedding', 'favorite'),
    ('event', 'social', 'Social', 'groups'),
    ('event', 'other', 'Other', 'more_horiz'),
    -- AssetCategory
    ('listing', 'furnitures', 'Furnitures', 'chair'),
    ('listing', 'sound_system', 'Sound System', 'speaker'),
    ('listing', 'decorations', 'Decorations', 'celebration'),
    ('listing', 'equipment', 'Equipment', 'construction'),
    -- VenueCategory
    ('listing', 'indoor', 'Indoor', 'home'),
    ('listing', 'outdoor', 'Outdoor', 'park'),
    ('listing', 'hotel', 'Hotel', 'hotel'),
    ('listing', 'beach_resort', 'Beach Resort', 'beach_access'),
    ('listing', 'garden', 'Garden', 'local_florist'),
    ('listing', 'mix', 'Mix', 'shuffle'),
    -- ServiceCategory
    ('listing', 'design', 'Design', 'palette'),
    ('listing', 'catering', 'Catering', 'restaurant'),
    ('listing', 'entertainment', 'Entertainment', 'music_note'),
    ('listing', 'service_staff', 'Service Staff', 'support_agent'),
    ('listing', 'photography', 'Photography', 'camera_alt'),
    ('listing', 'videography', 'Videography', 'videocam'),
    ('listing', 'dj', 'DJ', 'headphones'),
    ('listing', 'live_band', 'Live Band', 'queue_music'),
    ('listing', 'mc', 'MC', 'mic')
) AS v(parent_slug, slug, name, icon)
JOIN "categories" p ON p."slug" = v.parent_slug
ON CONFLICT ("slug") DO NOTHING;
