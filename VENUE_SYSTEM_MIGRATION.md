# Venue System Migration Guide

## Overview
This migration adds a complete Venue system to separate **Hosts** (venue providers) from **Foxers** (event managers).

## Database Schema Changes

### New User Roles
- Added `foxer` to `UserRole` enum
- Added `isFoxer` boolean field to User model

### New Venue Status Enum
```prisma
enum VenueStatus {
  draft
  active
  inactive
  under_maintenance
}
```

### New Models Created

#### 1. **Venue** - Physical spaces provided by Hosts
- `id`, `hostId`, `categoryId`
- `name`, `description`, `venueType`
- `capacity`, `status`, `isPublished`
- `address`, `city`, `state`, `country`
- `latitude`, `longitude`
- Relations: `host`, `category`, `amenities`, `pricing`, `images`, `reviews`, `events`

#### 2. **VenueAmenity** - Venue features (WiFi, Parking, etc.)
- `id`, `venueId`, `name`, `icon`

#### 3. **VenuePricing** - Pricing for venue rentals
- `id`, `venueId`
- `pricePerDay`, `pricePerHour`
- `currency`, `minHours`

#### 4. **VenueImage** - Venue photos
- `id`, `venueId`, `imageUrl`, `altText`
- `displayOrder`, `isPrimary`

#### 5. **VenueReview** - Reviews for venues
- `id`, `venueId`, `userId`
- `rating`, `comment`

### Updated Models

#### User Model
**Before:**
```prisma
isHost Boolean @default(false)
events Event[] @relation("HostEvents")
```

**After:**
```prisma
isHost  Boolean @default(false)
isFoxer Boolean @default(false)
venues  Venue[] @relation("HostVenues")
events  Event[] @relation("FoxerEvents")
```

#### Event Model
**Before:**
```prisma
hostId String
host User @relation("HostEvents", ...)
```

**After:**
```prisma
foxerId String  // Foxer who created the event
venueId String? // Optional: Link to venue
foxer   User    @relation("FoxerEvents", ...)
venue   Venue?  @relation(...)
```

#### Category Model
Added:
```prisma
venues Venue[]
```

## Business Logic Changes

### Old System
- **Hosts** created Events directly
- Events had location data embedded

### New System
- **Hosts** create Venues (hotels, lands, spaces)
- **Foxers** create Events (can optionally use a Venue)
- Clear separation of concerns

## Migration Steps

### 1. **Run Prisma Migration**
```bash
cd C:/Users/CLYDE/Documents/GitHub/fox-passport-republic-api
npx prisma migrate dev --name add-venue-system
```

This will:
- Create all new tables
- Add new columns to User table
- Update Event table foreign keys
- Preserve existing data

### 2. **Generate Prisma Client**
```bash
npx prisma generate
```

### 3. **Data Migration (Optional)**
If you have existing events, you may want to:
- Convert old "host" events to either Venues or keep as Events
- Update `hostId` → `foxerId` if needed
- Add `isFoxer` flag to users who should be foxers

### 4. **Update Environment**
Ensure `.env` has:
```
DATABASE_URL="postgresql://user:password@localhost:5432/foxpassport"
```

## API Endpoints to Create

### Venue Endpoints
```
POST   /api/v1/venues                 - Create venue
GET    /api/v1/venues                 - Get all venues
GET    /api/v1/venues/:id             - Get venue by ID
PUT    /api/v1/venues/:id             - Update venue
DELETE /api/v1/venues/:id             - Delete venue
GET    /api/v1/venues/host/:hostId    - Get venues by host
GET    /api/v1/venues/category/:slug  - Get venues by category
```

### Venue Amenities
```
POST   /api/v1/venues/:id/amenities   - Add amenity
DELETE /api/v1/venues/:id/amenities/:amenityId - Remove amenity
```

### Venue Images
```
POST   /api/v1/venues/:id/images      - Add image
DELETE /api/v1/venues/:id/images/:imageId - Remove image
```

### Venue Reviews
```
POST   /api/v1/venues/:id/reviews     - Add review
GET    /api/v1/venues/:id/reviews     - Get venue reviews
```

## Frontend Changes Needed

### New Routes
- `/host` - Host dashboard (for venue management)
- `/host/venues/new` - Create new venue
- `/host/venues/:id/edit` - Edit venue
- `/venues/:id` - View venue details (public)

### Updated Routes
- `/foxer` - Foxer dashboard (for event management)
- `/foxer/events/new` - Create event (can select venue)

### User Flow

#### As a Host:
1. Register/Login
2. Set `isHost = true`
3. Go to `/host` dashboard
4. Create venues (hotels, spaces, lands)
5. Manage bookings from foxers
6. View analytics

#### As a Foxer:
1. Register/Login
2. Set `isFoxer = true`
3. Go to `/foxer` dashboard
4. Browse available venues
5. Create events (select venue or custom location)
6. Manage event details
7. Coordinate with hosts

#### As a User:
1. Browse events on homepage
2. See event details (including venue info)
3. Book event tickets
4. Leave reviews

## Testing Checklist

- [ ] Run migration successfully
- [ ] Create test venue via API
- [ ] Create test event with venue link
- [ ] Verify relationships work
- [ ] Test venue search/filter
- [ ] Test image upload for venues
- [ ] Test amenity management
- [ ] Test pricing calculations

## Rollback Plan

If issues occur:
```bash
npx prisma migrate reset
```

Then restore from backup or revert schema.prisma

## Notes

- **Breaking Change**: Event model changed from `hostId` to `foxerId`
- Existing events will need manual migration
- User roles need to be updated (add `isFoxer` flag)
- Frontend needs complete update for new flows

## Success Criteria

✅ Hosts can create and manage venues
✅ Foxers can create events using venues
✅ Users can browse both venues and events
✅ Clear separation between venue owners and event managers
✅ All APIs functional
✅ Frontend flows working

