# Master API Testing Guide

This guide provides a comprehensive flow to test the entire Fox Passport Republic API, including the unified Listing model, specialized types (Venues, Chairs, Food), and the multi-step booking process.

## Base URL
`http://localhost:3002/api/v1`

---

## 1. Authentication & Setup

### A. Register a mayor/Foxxer
- **Method**: `POST`
- **URL**: `/auth/register`
- **Body**:
```json
{
    "email": "foxxer@example.com",
    "password": "password123",
    "name": "Alex Foxxer",
    "username": "afoxxer",
    "role": "mayor"
}
```

### B. Login
- **Method**: `POST`
- **URL**: `/auth/login`
- **Body**:
```json
{
    "email": "foxxer@example.com",
    "password": "password123"
}
```
*Copy the `accessToken` for use in subsequent requests if Auth Middleware is enabled.*

---

## 2. Shared Setup: Categories

### A. Create a Parent Category (e.g., Wedding)
- **Method**: `POST`
- **URL**: `/categories`
- **Body**:
```json
{
    "name": "Wedding",
    "slug": "wedding",
    "iconUrl": "https://example.com/wedding.png"
    
}
```

### B. Create a Child Category (Hierarchy)
- **Method**: `POST`
- **URL**: `/categories`
- **Body**:
```json
{
    "name": "Beach Wedding",
    "slug": "beach-wedding",
    "description": "Seaside ceremonies",
    "parentCategoryId": "REPLACE_WITH_WEDDING_CATEGORY_ID"
}
```

---

## 3. Specialized Listings (The "What")

### A. Create a Venue
- **Method**: `POST`
- **URL**: `/listings/create-complete`
- **Body**:
```json
{
    "mayorId": "USER_ID",
    "title": "Garden Paradise Venue",
    "description": "A beautiful outdoor space for weddings.",
    "type": "venue",
    "capacity": 200,
    "pricing": { "basePrice": 1000, "currency": "USD" },
    "location": {
        "streetAddress": "123 Garden St",
        "city": "Manila",
        "country": "Philippines"
    }
}
```

### B. Create Equipment (e.g., Chairs)
- **Method**: `POST`
- **URL**: `/listings/create-complete`
- **Body**:
```json
{
    "mayorId": "USER_ID",
    "title": "Premium Gold Chairs",
    "description": "Elegant gold chairs for formal events.",
    "type": "equipment",
    "pricing": { "basePrice": 5, "currency": "USD" }
}
```

### C. Create Catering (e.g., Foods)
- **Method**: `POST`
- **URL**: `/listings/create-complete`
- **Body**:
```json
{
    "mayorId": "USER_ID",
    "title": "Royal Wedding Buffet",
    "description": "Exquisite 5-course catering service.",
    "type": "catering",
    "pricing": { "basePrice": 50, "currency": "USD" }
}
```

---

## 4. Discovery (The "Search")

### Fetch Specialized Types
- **Venues**: `GET /venues`
- **Chairs/Equipment**: `GET /chairs`
- **Foods/Catering**: `GET /foods`
- **Events**: `GET /events`

---

## 5. Multi-Step Booking Flow

### Step 1: Create Draft
- **Method**: `POST`
- **URL**: `/bookings/draft`
- **Body**: `{ "listingId": "ID", "userId": "ID" }`

### Step 2: Set Tickets/Quantity
- **Method**: `PATCH`
- **URL**: `/bookings/{{id}}/tickets`
- **Body**: `{ "userId": "ID", "guestCount": 5, "totalAmount": 250 }`

### Step 3: Customer Info
- **Method**: `PATCH`
- **URL**: `/bookings/{{id}}/customer-info`
- **Body**: `{ "userId": "ID", "specialRequests": "Near the stage please" }`

### Step 4: Confirm
- **Method**: `POST`
- **URL**: `/bookings/{{id}}/confirm`
- **Body**: `{ "userId": "ID" }`

### Scenario 2: Booking a Foxxer Service (Consumer-to-Foxxer)
This is for when a user wants to book a specialized service (like "Full Venue Styling") rather than the venue itself.

1. **Start Specialized Booking (Step 1)**
   - **Method**: `POST`
   - **URL**: `/client/bookings/start`
   - **Body**:
     ```json
     {
       "listingId": "VENUE_ID",
       "userId": "YOUR_USER_ID",
       "type": "foxxer_service",
       "foxxerServiceId": "FOXXER_SERVICE_ID"
     }
     ```

2. **Continue the Multi-Step Flow**
   - Follow the same steps as Scenario 1 (Tickets -> Customer Info -> Confirm -> Payment).
   - The system will now track this as a `foxxer_service` booking type!

---

## 6. Foxxer Services (The "Who")

### A. Create Profile
- **URL**: `/foxxers/profile` (POST)
- `{ "userId": "USER_ID", "bio": "Expert Wedding Planner" }`

### B. Link Service to Venue
- **URL**: `/foxxers/services` (POST)
- `{ "foxxerId": "ID", "listingId": "VENUE_ID", "categoryId": "CAT_ID", "serviceName": "Full Event Plan", "price": 500 }`

---

## 7. Postman Pro-Tips: Automating IDs

Instead of copying and pasting IDs manually, you can use the **Tests** tab in Postman to save IDs automatically.

### Save User ID after Login
In the **Tests** tab of your Login request:
```javascript
const response = pm.response.json();
if (response.success) {
    pm.environment.set("userId", response.data.user.id);
    pm.environment.set("accessToken", response.data.accessToken);
}
```

### Save Listing ID after Create
In the **Tests** tab of your Create Listing request:
```javascript
const response = pm.response.json();
if (response.success) {
    pm.environment.set("listingId", response.data.id);
}
```

### Environment Variables
1. Click the **Environment Quick Look** (eye icon) in the top right.
2. Create an environment named `Foxxer API`.
3. Add a variable `baseUrl` with value `http://localhost:3002/api/v1`.
4. Now you can use `{{baseUrl}}` and `{{listingId}}` in your URLs and bodies!
