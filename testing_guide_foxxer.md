# Testing Guide: Foxxer Services Integration

This guide provides a step-by-step flow to test the new Foxxer services and event categories using Postman and database verification.

## 1. Postman Testing Flow

### Step A: Create an Event Category
This handles categories like "Wedding" or "Romantic Date".
- **Method**: `POST`
- **URL**: `{{baseUrl}}/api/v1/foxxers/categories`
- **Body (JSON)**:
```json
{
    "name": "Wedding",
    "slug": "wedding",
    "iconUrl": "https://example.com/icons/wedding.png"
}
```

### Step B: Create a Foxxer Profile
Link an existing user to a Foxxer profile.
- **Method**: `POST`
- **URL**: `{{baseUrl}}/api/v1/foxxers/profile`
- **Body (JSON)**:
```json
{
    "userId": "REPLACE_WITH_ACTUAL_USER_ID",
    "bio": "Expert wedding decorator with 5 years experience.",
    "skills": "Floral arrangements, Lighting, Photography",
    "isAvailable": true
}
```

### Step C: Create a Listing Service
Connect a Foxxer to a specific Listing (Venue) for a specific Category.
- **Method**: `POST`
- **URL**: `{{baseUrl}}/api/v1/foxxers/services`
- **Body (JSON)**:
```json
{
    "foxxerId": "REPLACE_WITH_ACTUAL_FOXXER_ID_FROM_STEP_B",
    "listingId": "REPLACE_WITH_ACTUAL_LISTING_ID",
    "categoryId": "REPLACE_WITH_ACTUAL_CATEGORY_ID_FROM_STEP_A",
    "serviceName": "Bohemian Wedding Setup",
    "serviceDescription": "A complete bohemian floral and lighting setup for your venue.",
    "price": 500.00
}
```

### Step D: Fetch Services for a Listing
Verify that the services are correctly linked to the venue.
- **Method**: `GET`
- **URL**: `{{baseUrl}}/api/v1/foxxers/listing/{{listingId}}/services`

---

## 2. Database Verification

### Using Prisma Studio
The easiest way to see the connections is via Prisma Studio:
1. Run `npx prisma studio` in your terminal.
2. Open the `ListingFoxxerService` table.
3. You will see columns for `foxxerId`, `listingId`, and `categoryId` that link to their respective records.

### SQL Queries (Direct Access)
If you have direct access to PostgreSQL, you can run these queries:

**Check if the bridge table has data:**
```sql
SELECT * FROM listing_foxxer_services;
```

**Join query to see the full story:**
```sql
SELECT 
    lfs."serviceName",
    l.title AS venue_name,
    u.name AS foxxer_name,
    ec.name AS category_name,
    lfs.price
FROM listing_foxxer_services lfs
JOIN listings l ON lfs.listing_id = l.id
JOIN foxxer_profiles fp ON lfs.foxxer_id = fp.id
JOIN users u ON fp.user_id = u.id
JOIN event_categories ec ON lfs.category_id = ec.id;
```

---

## 3. Potential Errors & Troubleshooting
- **404 Not Found**: Ensure the `userId`, `listingId`, and `categoryId` exist before creating a service.
- **Validation Error**: Check that the `price` is a number and `url` fields are valid URIs.
- **Foreign Key Violation**: Prisma will prevent you from deleting a Listing or User if they are linked to an active Foxxer service.
