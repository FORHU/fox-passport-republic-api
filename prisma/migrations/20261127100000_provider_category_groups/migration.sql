-- Provider main categories with subcategories (api#503).
--
-- Additive: two new columns with defaults, new catalog rows, and existing rows
-- moved under a main category or renamed. No slug changes: slugs are what
-- applications, profiles and listings store, so every stored value still
-- matches its row. The previous app version reads `GET
-- /categories/provider-specialties`, which keeps its fields.

-- AlterTable
ALTER TABLE "categories" ADD COLUMN "isGroup" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "categories" ADD COLUMN "retiredAt" TIMESTAMP(3);

-- The main categories, under `listing`.
INSERT INTO "categories" ("id", "slug", "name", "icon", "isGroup", "parentCategoryId", "updatedAt")
SELECT gen_random_uuid()::text, v.slug, v.name, v.icon, true, p."id", CURRENT_TIMESTAMP
FROM (VALUES
    ('sound_lights', 'Sound & Lights', 'speaker'),
    ('photo_video', 'Photo & Video', 'photo_camera'),
    ('music_entertainment', 'Music & Entertainment', 'music_note'),
    ('food_drinks', 'Food & Drinks', 'restaurant'),
    ('styling_decor', 'Styling & Décor', 'celebration'),
    ('rentals', 'Rentals', 'chair'),
    ('event_staff', 'Event Staff', 'support_agent'),
    ('beauty_attire', 'Beauty & Attire', 'face'),
    ('transport', 'Transport', 'directions_car')
) AS v(slug, name, icon)
JOIN "categories" p ON p."slug" = 'listing'
ON CONFLICT ("slug") DO NOTHING;

-- Existing specialties move under their main category; three are renamed.
UPDATE "categories" c
SET "parentCategoryId" = g."id", "name" = v.name, "updatedAt" = CURRENT_TIMESTAMP
FROM (VALUES
    ('sound_system', 'sound_lights', 'Sound system'),
    ('photography', 'photo_video', 'Photography'),
    ('videography', 'photo_video', 'Videography'),
    ('dj', 'music_entertainment', 'DJ'),
    ('live_band', 'music_entertainment', 'Live band'),
    ('mc', 'music_entertainment', 'MC & host'),
    ('catering', 'food_drinks', 'Catering'),
    ('decorations', 'styling_decor', 'Event styling'),
    ('design', 'styling_decor', 'Invitations & signage'),
    ('furnitures', 'rentals', 'Tables & chairs'),
    ('service_staff', 'event_staff', 'Waiters & service staff')
) AS v(slug, group_slug, name)
JOIN "categories" g ON g."slug" = v.group_slug
WHERE c."slug" = v.slug;

-- New subcategories.
INSERT INTO "categories" ("id", "slug", "name", "parentCategoryId", "updatedAt")
SELECT gen_random_uuid()::text, v.slug, v.name, g."id", CURRENT_TIMESTAMP
FROM (VALUES
    ('sound_lights', 'lighting', 'Lighting'),
    ('sound_lights', 'led_screens', 'LED screens & projectors'),
    ('sound_lights', 'stage_truss', 'Stage & truss'),
    ('sound_lights', 'special_effects', 'Special effects'),
    ('photo_video', 'photo_booth', 'Photo booth'),
    ('photo_video', 'drone_coverage', 'Drone coverage'),
    ('photo_video', 'live_streaming', 'Live streaming'),
    ('music_entertainment', 'solo_performer', 'Solo / acoustic performer'),
    ('music_entertainment', 'dancers', 'Dancers'),
    ('music_entertainment', 'kids_entertainers', 'Magician & kids'' entertainers'),
    ('food_drinks', 'cakes_desserts', 'Cakes & desserts'),
    ('food_drinks', 'mobile_bar', 'Mobile bar & drinks'),
    ('food_drinks', 'food_carts', 'Food carts'),
    ('styling_decor', 'flowers', 'Flowers'),
    ('styling_decor', 'balloons', 'Balloons'),
    ('styling_decor', 'backdrops_props', 'Backdrops & props'),
    ('rentals', 'tents', 'Tents'),
    ('rentals', 'linens_tableware', 'Linens & tableware'),
    ('rentals', 'generators_power', 'Generators & power'),
    ('event_staff', 'event_coordinators', 'Event coordinators'),
    ('event_staff', 'ushers', 'Ushers'),
    ('event_staff', 'security', 'Security'),
    ('event_staff', 'cleaning', 'Cleaning'),
    ('beauty_attire', 'hair_makeup', 'Hair & makeup'),
    ('beauty_attire', 'gowns_suits', 'Gowns & suits'),
    ('transport', 'bridal_cars', 'Bridal & VIP cars'),
    ('transport', 'guest_shuttles', 'Guest shuttles')
) AS v(group_slug, slug, name)
JOIN "categories" g ON g."slug" = v.group_slug
ON CONFLICT ("slug") DO NOTHING;

-- Too broad to pick: no longer offered, still valid for Providers who hold
-- them, and still the value some listings carry.
UPDATE "categories"
SET "retiredAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" IN ('equipment', 'entertainment') AND "retiredAt" IS NULL;
