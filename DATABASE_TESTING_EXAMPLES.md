# Database Testing Examples

Use these examples to verify your data directly in the database (via pgAdmin, DBeaver, or Prisma Studio).

---

## 1. Quick Verification (Listings)
To see all your specialized listings and their types.

**SQL:**
```sql
SELECT title, type, status, capacity, "createdAt" 
FROM listings 
ORDER BY type;
```

**In Prisma Studio:**
1. Open the **`Listing`** table.
2. Click **Add filter** -> `type` -> `equals` -> `equipment` (to see the Chairs).
3. Click **Add filter** -> `type` -> `equals` -> `catering` (to see the Food).

---

## 2. Advanced: Venues with Pricing & Location
To verify that your Ballroom has its address and price attached correctly.

**SQL:**
```sql
SELECT 
    l.title, 
    loc.city, 
    loc.country, 
    lp."basePrice", 
    lp.currency
FROM listings l
JOIN listing_locations loc ON l.id = loc."listingId"
JOIN listing_pricing lp ON l.id = lp."listingId"
WHERE l.type = 'venue';
```

---

## 3. Foxxer Service Verification
Check which Foxxer is linked to which Listing and what service they provide.

**SQL:**
```sql
SELECT 
    u.name as foxxer_name, 
    l.title as venue_name, 
    lfs."serviceName", 
    lfs.price 
FROM listing_foxxer_services lfs
JOIN foxxer_profiles fp ON lfs."foxxerId" = fp.id
JOIN users u ON fp."userId" = u.id
JOIN listings l ON lfs."listingId" = l.id;
```

---

## 4. Booking Progress Tracking
Since you have a multi-step booking flow, you can check where a guest currently is.

**SQL:**
```sql
SELECT 
    u.name as guest_name, 
    l.title as booking_for, 
    b."bookingStatus", 
    b."currentStep", 
    b."totalAmount"
FROM bookings b
JOIN users u ON b."userId" = u.id
JOIN listings l ON b."listingId" = l.id;
```

---

## 5. Category Hierarchy
Check if your categories (like Wedding) are correctly set up.

**SQL:**
```sql
SELECT name, slug, description 
FROM categories;
```
