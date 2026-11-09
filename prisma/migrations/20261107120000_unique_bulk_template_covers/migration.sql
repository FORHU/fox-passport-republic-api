-- Data-only fix: give each bulk seed package its own cover photo.
--
-- prisma/seeder/event.seeder.ts used to give every bulk template the same
-- cover per category, so search results (e.g. Wedding / Cebu) showed one
-- photo on every package. The seeder now sets a cover per package
-- (BULK_TEMPLATE_DEFS[].cover). Deploys run `prisma migrate deploy` but
-- never the seed, so this updates the already-seeded rows by their fixed ids.
-- Databases without these seed rows (production, fresh test DBs) match
-- nothing and are unchanged. No schema change.
--
-- Must match BULK_TEMPLATE_DEFS; tests/bulk-template-covers.spec.ts checks it.
UPDATE "files"
SET "url" = CASE "id"
    WHEN 'seed-file-bulk-beach-wedding-1' THEN 'https://images.unsplash.com/photo-1537633552985-df8429e8048b?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-garden-birthday-1' THEN 'https://images.unsplash.com/photo-1602631985686-1bb0e6a8696e?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-rooftop-social-1' THEN 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-corp-summit-1' THEN 'https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-debut-party-1' THEN 'https://images.unsplash.com/photo-1535254973040-607b474cb50d?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-cebu-fiesta-1' THEN 'https://images.unsplash.com/photo-1498931299472-f7a63a5a1cfa?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-davao-corp-1' THEN 'https://images.unsplash.com/photo-1544531586-fde5298cdd40?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-intimate-wedding-1' THEN 'https://images.unsplash.com/photo-1525772764200-be829a350797?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-pool-party-1' THEN 'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-art-exhibit-1' THEN 'https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-holiday-gala-1' THEN 'https://images.unsplash.com/photo-1531058020387-3be344556be6?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-outdoor-concert-1' THEN 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-kiddie-party-1' THEN 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-reunion-package-1' THEN 'https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-product-launch-1' THEN 'https://images.unsplash.com/photo-1560439513-74b037a25d84?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-sunset-dinner-1' THEN 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-music-festival-1' THEN 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-corporate-manila-2-1' THEN 'https://images.unsplash.com/photo-1431540015161-0bf868a2d407?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-birthday-cebu-2-1' THEN 'https://images.unsplash.com/photo-1496843916299-590492c751f4?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-wedding-davao-2-1' THEN 'https://images.unsplash.com/photo-1607190074257-dd4b7af0309f?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-social-baguio-2-1' THEN 'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-other-clark-2-1' THEN 'https://images.unsplash.com/photo-1470753323753-3f8091bb0232?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-corporate-davao-2-1' THEN 'https://images.unsplash.com/photo-1560523159-4a9692d222ef?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-birthday-manila-2-1' THEN 'https://images.unsplash.com/photo-1558636508-e0db3814bd1d?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-wedding-cebu-2-1' THEN 'https://images.unsplash.com/photo-1523438885200-e635ba2c371e?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-social-makati-2-1' THEN 'https://images.unsplash.com/photo-1516997121675-4c2d1684aa3e?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-other-cebu-2-1' THEN 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-wedding-manila-2-1' THEN 'https://images.unsplash.com/photo-1438032005730-c779502df39b?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-social-cebu-2-1' THEN 'https://images.unsplash.com/photo-1475483768296-6163e08872a1?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-corporate-baguio-2-1' THEN 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-birthday-makati-2-1' THEN 'https://images.unsplash.com/photo-1513278974582-3e1b4a4fa21e?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-other-manila-2-1' THEN 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-corporate-makati-2-1' THEN 'https://images.unsplash.com/photo-1578474846511-04ba529f0b88?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-birthday-cebu-3-1' THEN 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-wedding-baguio-2-1' THEN 'https://images.unsplash.com/photo-1591604466107-ec97de577aff?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-social-clark-2-1' THEN 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-other-davao-2-1' THEN 'https://images.unsplash.com/photo-1533900298318-6b8da08a523e?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-wedding-clark-2-1' THEN 'https://images.unsplash.com/photo-1546032996-6dfacbacbf3f?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-social-davao-2-1' THEN 'https://images.unsplash.com/photo-1547153760-18fc86324498?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-corporate-cebu-2-1' THEN 'https://images.unsplash.com/photo-1591115765373-5207764f72e7?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-birthday-baguio-2-1' THEN 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-other-makati-2-1' THEN 'https://images.unsplash.com/photo-1531243269054-5ebf6f34081e?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-wedding-cebu-3-1' THEN 'https://images.unsplash.com/photo-1544078751-58fee2d8a03b?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-social-manila-2-1' THEN 'https://images.unsplash.com/photo-1527224857830-43a7acc85260?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-corporate-davao-3-1' THEN 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-birthday-clark-2-1' THEN 'https://images.unsplash.com/photo-1627556704290-2b1f5853ff78?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-other-clark-3-1' THEN 'https://images.unsplash.com/photo-1543589077-47d81606c1bf?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-wedding-manila-3-1' THEN 'https://images.unsplash.com/photo-1529636798458-92182e662485?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-social-cebu-3-1' THEN 'https://images.unsplash.com/photo-1439539698758-ba2680ecadb9?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-corporate-davao-4-1' THEN 'https://images.unsplash.com/photo-1561489413-985b06da5bee?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-birthday-baguio-3-1' THEN 'https://images.unsplash.com/photo-1471286174890-9c112ffca5b4?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-other-manila-3-1' THEN 'https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-corporate-makati-3-1' THEN 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-social-makati-3-1' THEN 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-wedding-davao-3-1' THEN 'https://images.unsplash.com/photo-1510076857177-7470076d4098?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-birthday-manila-3-1' THEN 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-other-baguio-2-1' THEN 'https://images.unsplash.com/photo-1504609813442-a8924e83f76e?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-corporate-clark-2-1' THEN 'https://images.unsplash.com/photo-1561489396-888724a1543d?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-social-clark-3-1' THEN 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-wedding-baguio-3-1' THEN 'https://images.unsplash.com/photo-1532712938310-34cb3982ef74?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-birthday-davao-2-1' THEN 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-social-manila-3-1' THEN 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-other-cebu-3-1' THEN 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-corporate-baguio-3-1' THEN 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-wedding-makati-2-1' THEN 'https://images.unsplash.com/photo-1469371670807-013ccf25f16a?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-social-davao-3-1' THEN 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-birthday-clark-3-1' THEN 'https://images.unsplash.com/photo-1532117182044-031e7cd916ee?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-corporate-makati-4-1' THEN 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-other-baguio-3-1' THEN 'https://images.unsplash.com/photo-1467307983825-619715426c70?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-wedding-cebu-4-1' THEN 'https://images.unsplash.com/photo-1530023367847-a683933f4172?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-social-manila-4-1' THEN 'https://images.unsplash.com/photo-1596436889106-be35e843f974?w=800&auto=format&fit=crop'
    WHEN 'seed-file-bulk-birthday-cebu-4-1' THEN 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&auto=format&fit=crop'
    END,
  "updatedAt" = NOW()
WHERE "id" IN (
  'seed-file-bulk-beach-wedding-1',
  'seed-file-bulk-garden-birthday-1',
  'seed-file-bulk-rooftop-social-1',
  'seed-file-bulk-corp-summit-1',
  'seed-file-bulk-debut-party-1',
  'seed-file-bulk-cebu-fiesta-1',
  'seed-file-bulk-davao-corp-1',
  'seed-file-bulk-intimate-wedding-1',
  'seed-file-bulk-pool-party-1',
  'seed-file-bulk-art-exhibit-1',
  'seed-file-bulk-holiday-gala-1',
  'seed-file-bulk-outdoor-concert-1',
  'seed-file-bulk-kiddie-party-1',
  'seed-file-bulk-reunion-package-1',
  'seed-file-bulk-product-launch-1',
  'seed-file-bulk-sunset-dinner-1',
  'seed-file-bulk-music-festival-1',
  'seed-file-bulk-corporate-manila-2-1',
  'seed-file-bulk-birthday-cebu-2-1',
  'seed-file-bulk-wedding-davao-2-1',
  'seed-file-bulk-social-baguio-2-1',
  'seed-file-bulk-other-clark-2-1',
  'seed-file-bulk-corporate-davao-2-1',
  'seed-file-bulk-birthday-manila-2-1',
  'seed-file-bulk-wedding-cebu-2-1',
  'seed-file-bulk-social-makati-2-1',
  'seed-file-bulk-other-cebu-2-1',
  'seed-file-bulk-wedding-manila-2-1',
  'seed-file-bulk-social-cebu-2-1',
  'seed-file-bulk-corporate-baguio-2-1',
  'seed-file-bulk-birthday-makati-2-1',
  'seed-file-bulk-other-manila-2-1',
  'seed-file-bulk-corporate-makati-2-1',
  'seed-file-bulk-birthday-cebu-3-1',
  'seed-file-bulk-wedding-baguio-2-1',
  'seed-file-bulk-social-clark-2-1',
  'seed-file-bulk-other-davao-2-1',
  'seed-file-bulk-wedding-clark-2-1',
  'seed-file-bulk-social-davao-2-1',
  'seed-file-bulk-corporate-cebu-2-1',
  'seed-file-bulk-birthday-baguio-2-1',
  'seed-file-bulk-other-makati-2-1',
  'seed-file-bulk-wedding-cebu-3-1',
  'seed-file-bulk-social-manila-2-1',
  'seed-file-bulk-corporate-davao-3-1',
  'seed-file-bulk-birthday-clark-2-1',
  'seed-file-bulk-other-clark-3-1',
  'seed-file-bulk-wedding-manila-3-1',
  'seed-file-bulk-social-cebu-3-1',
  'seed-file-bulk-corporate-davao-4-1',
  'seed-file-bulk-birthday-baguio-3-1',
  'seed-file-bulk-other-manila-3-1',
  'seed-file-bulk-corporate-makati-3-1',
  'seed-file-bulk-social-makati-3-1',
  'seed-file-bulk-wedding-davao-3-1',
  'seed-file-bulk-birthday-manila-3-1',
  'seed-file-bulk-other-baguio-2-1',
  'seed-file-bulk-corporate-clark-2-1',
  'seed-file-bulk-social-clark-3-1',
  'seed-file-bulk-wedding-baguio-3-1',
  'seed-file-bulk-birthday-davao-2-1',
  'seed-file-bulk-social-manila-3-1',
  'seed-file-bulk-other-cebu-3-1',
  'seed-file-bulk-corporate-baguio-3-1',
  'seed-file-bulk-wedding-makati-2-1',
  'seed-file-bulk-social-davao-3-1',
  'seed-file-bulk-birthday-clark-3-1',
  'seed-file-bulk-corporate-makati-4-1',
  'seed-file-bulk-other-baguio-3-1',
  'seed-file-bulk-wedding-cebu-4-1',
  'seed-file-bulk-social-manila-4-1',
  'seed-file-bulk-birthday-cebu-4-1'
);
