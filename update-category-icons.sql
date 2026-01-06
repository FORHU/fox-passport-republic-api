-- Update category icons to match the new category structure
-- This script updates the icon field for each category

UPDATE categories
SET icon = CASE
    WHEN slug = 'festivals-fairs' THEN 'PartyPopper'
    WHEN slug = 'classes-workshops' THEN 'GraduationCap'
    WHEN slug = 'live-performances' THEN 'Music'
    WHEN slug = 'tours-excursions' THEN 'MapPin'
    WHEN slug = 'parties-socials' THEN 'Users'
    WHEN slug = 'markets-popups' THEN 'ShoppingBag'
    WHEN slug = 'competitions-games' THEN 'Trophy'
    ELSE icon
END,
"updatedAt" = NOW()
WHERE slug IN (
    'festivals-fairs',
    'classes-workshops',
    'live-performances',
    'tours-excursions',
    'parties-socials',
    'markets-popups',
    'competitions-games'
);
