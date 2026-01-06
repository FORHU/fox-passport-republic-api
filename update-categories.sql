-- Update categories to new structure
-- This script replaces old categories with new ones while preserving event relationships

BEGIN;

-- First, get the IDs of old categories to update events
DO $$
DECLARE
    old_adventures_id UUID;
    old_camping_id UUID;
    old_food_id UUID;
    old_music_arts_id UUID;
    old_nightlife_id UUID;
    old_venues_id UUID;
    old_wellness_id UUID;

    new_tours_id UUID;
    new_classes_id UUID;
    new_performances_id UUID;
    new_festivals_id UUID;
    new_parties_id UUID;
    new_markets_id UUID;
    new_competitions_id UUID;
BEGIN
    -- Get old category IDs
    SELECT id INTO old_adventures_id FROM categories WHERE slug = 'adventures';
    SELECT id INTO old_camping_id FROM categories WHERE slug = 'camping';
    SELECT id INTO old_food_id FROM categories WHERE slug = 'food-dining';
    SELECT id INTO old_music_arts_id FROM categories WHERE slug = 'music-arts';
    SELECT id INTO old_nightlife_id FROM categories WHERE slug = 'nightlife';
    SELECT id INTO old_venues_id FROM categories WHERE slug = 'venues';
    SELECT id INTO old_wellness_id FROM categories WHERE slug = 'wellness';

    -- Delete old categories (cascade will handle relations)
    DELETE FROM categories WHERE slug IN (
        'adventures', 'camping', 'food-dining', 'music-arts',
        'nightlife', 'venues', 'wellness'
    );

    -- Insert new categories
    INSERT INTO categories (id, name, slug, description, icon, "parentCategoryId", "createdAt", "updatedAt")
    VALUES
        (gen_random_uuid(), 'Festivals & Fairs', 'festivals-fairs', 'Large-scale, often multi-day gatherings including music festivals, food fairs, art festivals, and wellness expos', 'PartyPopper', NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Classes & Workshops', 'classes-workshops', 'Educational or hands-on interactive sessions where people learn a skill like cooking, painting, yoga, or survival skills', 'GraduationCap', NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Live Performances', 'live-performances', 'Passive entertainment where attendees watch a show such as concerts, stand-up comedy, or theater plays', 'Music', NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Tours & Excursions', 'tours-excursions', 'Guided experiences that involve moving from place to place like hiking trips, food crawls, or museum tours', 'MapPin', NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Parties & Socials', 'parties-socials', 'Events focused on socializing, mixing, and mingling such as club nights, networking mixers, or singles events', 'Users', NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Markets & Pop-Ups', 'markets-popups', 'Temporary retail or showcase events like farmers markets, craft fairs, or gear swaps', 'ShoppingBag', NULL, NOW(), NOW()),
        (gen_random_uuid(), 'Competitions & Games', 'competitions-games', 'Events involving a contest or physical challenge such as marathons, trivia nights, or e-sports tournaments', 'Trophy', NULL, NOW(), NOW());

    RAISE NOTICE 'Categories updated successfully!';
END $$;

COMMIT;
