-- Update user to host role
-- Replace 'your-email@example.com' with your actual email address

UPDATE "User"
SET role = 'host', "isHost" = true
WHERE email = 'your-email@example.com';

-- Verify the update
SELECT id, email, username, role, "isHost"
FROM "User"
WHERE email = 'your-email@example.com';
