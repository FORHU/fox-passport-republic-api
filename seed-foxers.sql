-- Seed Foxer data
-- First, ensure we have users with foxer role

DO $$
DECLARE
  user1_id UUID;
  user2_id UUID;
  user3_id UUID;
  user4_id UUID;
  user5_id UUID;
  user6_id UUID;

  foxer1_id UUID;
  foxer2_id UUID;
  foxer3_id UUID;
  foxer4_id UUID;
  foxer5_id UUID;
  foxer6_id UUID;
BEGIN
  -- Create foxer users (if they don't exist)
  INSERT INTO users (id, email, password, name, username, role, "isFoxer", "isVerified", "createdAt", "updatedAt")
  VALUES
    (gen_random_uuid(), 'jasmine@foxpassport.com', '$2b$10$abcdefghijklmnopqrstuv', 'Jasmine L.', 'jasmine_l', 'foxer', true, true, NOW(), NOW()),
    (gen_random_uuid(), 'marco@foxpassport.com', '$2b$10$abcdefghijklmnopqrstuv', 'Marco D.', 'marco_d', 'foxer', true, true, NOW(), NOW()),
    (gen_random_uuid(), 'sarah@foxpassport.com', '$2b$10$abcdefghijklmnopqrstuv', 'Sarah K.', 'sarah_k', 'foxer', true, true, NOW(), NOW()),
    (gen_random_uuid(), 'alex@foxpassport.com', '$2b$10$abcdefghijklmnopqrstuv', 'Alex T.', 'alex_t', 'foxer', true, true, NOW(), NOW()),
    (gen_random_uuid(), 'elena@foxpassport.com', '$2b$10$abcdefghijklmnopqrstuv', 'Elena R.', 'elena_r', 'foxer', true, true, NOW(), NOW()),
    (gen_random_uuid(), 'ben@foxpassport.com', '$2b$10$abcdefghijklmnopqrstuv', 'Ben M.', 'ben_m', 'foxer', true, true, NOW(), NOW())
  ON CONFLICT (email) DO NOTHING
  RETURNING id INTO user1_id, user2_id, user3_id, user4_id, user5_id, user6_id;

  -- Get user IDs
  SELECT id INTO user1_id FROM users WHERE email = 'jasmine@foxpassport.com';
  SELECT id INTO user2_id FROM users WHERE email = 'marco@foxpassport.com';
  SELECT id INTO user3_id FROM users WHERE email = 'sarah@foxpassport.com';
  SELECT id INTO user4_id FROM users WHERE email = 'alex@foxpassport.com';
  SELECT id INTO user5_id FROM users WHERE email = 'elena@foxpassport.com';
  SELECT id INTO user6_id FROM users WHERE email = 'ben@foxpassport.com';

  -- Create Foxer Profiles
  INSERT INTO foxer_profiles (id, "userId", role, bio, rating, "reviewCount", status, "isVerified", specialties, "hourlyRate", currency, "createdAt", "updatedAt")
  VALUES
    (gen_random_uuid(), user1_id, 'Event Stylist', 'I turn pine forests into fairy tales. Specializing in boho camping setups and intimate gatherings.', 4.9, 128, 'online', true, ARRAY['Boho', 'Camping', 'Music'], 2500.00, 'PHP', NOW(), NOW()),
    (gen_random_uuid(), user2_id, 'Adventure Guide', 'Leading treks and organizing outdoor activities. Let''s make your team building unforgettable.', 5.0, 84, 'online', true, ARRAY['Trekking', 'TeamBuilding'], 3000.00, 'PHP', NOW(), NOW()),
    (gen_random_uuid(), user3_id, 'Live Music & DJ', 'Acoustic vibes for sunset or electric beats for the after-party. I bring the sound system.', 4.8, 56, 'offline', true, ARRAY['LiveBand', 'DJ'], 5000.00, 'PHP', NOW(), NOW()),
    (gen_random_uuid(), user4_id, 'Outdoor Chef', 'Gourmet meals under the stars. I provide the full catering experience for your camp.', 4.9, 203, 'online', true, ARRAY['Foodie', 'Catering'], 4500.00, 'PHP', NOW(), NOW()),
    (gen_random_uuid(), user5_id, 'Yoga Instructor', 'Start your day with sunrise yoga sessions overlooking the mountains. Mats provided.', 5.0, 42, 'away', true, ARRAY['Wellness', 'Yoga'], 2000.00, 'PHP', NOW(), NOW()),
    (gen_random_uuid(), user6_id, 'Photographer', 'Capturing your best moments. I specialize in candid shots and drone photography.', 4.9, 195, 'online', true, ARRAY['Photography', 'Drone'], 3500.00, 'PHP', NOW(), NOW())
  ON CONFLICT ("userId") DO NOTHING
  RETURNING id INTO foxer1_id, foxer2_id, foxer3_id, foxer4_id, foxer5_id, foxer6_id;

  -- Get foxer profile IDs
  SELECT id INTO foxer1_id FROM foxer_profiles WHERE "userId" = user1_id;
  SELECT id INTO foxer2_id FROM foxer_profiles WHERE "userId" = user2_id;
  SELECT id INTO foxer3_id FROM foxer_profiles WHERE "userId" = user3_id;
  SELECT id INTO foxer4_id FROM foxer_profiles WHERE "userId" = user4_id;
  SELECT id INTO foxer5_id FROM foxer_profiles WHERE "userId" = user5_id;
  SELECT id INTO foxer6_id FROM foxer_profiles WHERE "userId" = user6_id;

  -- Add gallery images for each foxer
  INSERT INTO foxer_gallery ("foxerId", "imageUrl", caption, "displayOrder")
  VALUES
    -- Jasmine L. gallery
    (foxer1_id, 'https://images.unsplash.com/photo-1478146896981-b80fe463b330?auto=format&fit=crop&q=80&w=400', 'Boho setup', 0),
    (foxer1_id, 'https://images.unsplash.com/photo-1504851149312-7a075b496cc7?auto=format&fit=crop&q=80&w=400', 'Forest gathering', 1),
    (foxer1_id, 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&q=80&w=400', 'Night ambiance', 2),

    -- Marco D. gallery
    (foxer2_id, 'https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&q=80&w=400', 'Mountain trek', 0),
    (foxer2_id, 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=400', 'Team building', 1),
    (foxer2_id, 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&q=80&w=400', 'Peak view', 2),

    -- Sarah K. gallery
    (foxer3_id, 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=400', 'Live performance', 0),
    (foxer3_id, 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&q=80&w=400', 'DJ setup', 1),
    (foxer3_id, 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&q=80&w=400', 'Sound system', 2),

    -- Alex T. gallery
    (foxer4_id, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&q=80&w=400', 'Outdoor cooking', 0),
    (foxer4_id, 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&q=80&w=400', 'Gourmet dish', 1),
    (foxer4_id, 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&q=80&w=400', 'Catering setup', 2),

    -- Elena R. gallery
    (foxer5_id, 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&q=80&w=400', 'Sunrise yoga', 0),
    (foxer5_id, 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&q=80&w=400', 'Mountain meditation', 1),
    (foxer5_id, 'https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?auto=format&fit=crop&q=80&w=400', 'Wellness retreat', 2),

    -- Ben M. gallery
    (foxer6_id, 'https://images.unsplash.com/photo-1452587925148-ce544e77e70d?auto=format&fit=crop&q=80&w=400', 'Landscape shot', 0),
    (foxer6_id, 'https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?auto=format&fit=crop&q=80&w=400', 'Drone photography', 1),
    (foxer6_id, 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&q=80&w=400', 'Candid moments', 2);

  RAISE NOTICE 'Foxer profiles and gallery images created successfully!';
END $$;
