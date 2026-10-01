# Identity Model Refactoring Plan: Modular Architecture

**Branch:** `refactor/modular-identity-architecture`  
**Target Repository:** `fox-passport-republic-api`  
**Status:** In Progress — Stage 1 (Expand) Schema & Migration Created; Stage 3 (Switch) Application Updates Next

---

## 1. Executive Summary & Objective

In FoxPassport, the `User` model currently functions as a "God Model" carrying core identity, personal profile data, platform settings, payment tokens, real-time activity metrics, and 70+ inverse relations.

We are refactoring the architecture to separate **database identity** from **feature-specific domain extensions** using dedicated 1:1 and 1:N models/tables following an **Expand ➔ Migrate ➔ Switch ➔ Contract** rollout pattern.

```
                      ┌───────────────────────┐
                      │         User          │
                      │ Identity Anchor       │
                      │───────────────────────│
                      │ id                    │
                      │ email                 │
                      │ username?             │
                      │ passwordHash?         │  ← Nullable (OAuth-only accounts have null)
                      │ name                  │
                      │ systemRole            │
                      │ roleType[]            │
                      │ isEmailVerified       │
                      │ createdAt, updatedAt  │
                      └───────────┬───────────┘
                                  │
      ┌───────────────────────────┼───────────────────────────┐
      ▼                           ▼                           ▼
UserProfile                 UserSettings                UserActivity
profile data                preferences                 runtime state
├── phone                   └── preferredCurrency       ├── lastActiveAt (authenticated activity)
├── imgId (avatar)                                      └── lastSeenAt   (connection presence)
├── address, city, country
└── isPrivate
      │
      ├─────────────────────────── OAuthAccount[] (provider: GOOGLE | FACEBOOK | APPLE)
      │
      ├─────────────────────────── RefreshToken[] (jti, tokenHash, rotation tracking)
      │
      └─────────────────────────── PaymentAccount? (Lazy: Stripe customer / connect accounts)
```

The 70+ Prisma inverse relations (`bookings`, `posts`, `events`, `conversations`, etc.) remain connected to `User.id` as foreign-key anchors.

---

## 2. Complete Target Prisma Schema

### 2.1 Enums
```prisma
enum OAuthProvider {
  GOOGLE
  FACEBOOK
  APPLE
}
```

### 2.2 Core Identity (`users`)
```prisma
model User {
  id              String       @id @default(uuid())
  email           String       @unique
  // TEMPORARY: Retained only during Expand/Switch for zero-downtime; dropped in Contract.
  password        String?
  passwordHash    String?      // Target password hash column. Null for OAuth-only users.
  name            String
  username        String?      @unique
  systemRole      SystemRole   @default(user)
  roleType        RoleType[]
  isEmailVerified Boolean      @default(false)
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  // Legacy columns (preserved during Expand -> Migrate -> Switch phases; dropped in Contract)
  address                  String?
  city                     String?
  state                    String?
  country                  String?                      @default("Philippines")
  googleId                 String?                      @unique
  phone                    String?
  imgId                    String?
  stripeCustomerId         String?                      @unique
  stripeChargesEnabled     Boolean                      @default(false)
  stripePayoutsEnabled     Boolean                      @default(false)
  preferredCurrency        String                       @default("PHP")
  stripeAccountId          String?                      @unique
  stripeOnboardingComplete Boolean                      @default(false)
  isPrivate                Boolean                      @default(false)
  lastActiveAt             DateTime?

  // 1:1 Domain Extensions (Self-healing if missing)
  profile         UserProfile?
  settings        UserSettings?
  paymentAccount  PaymentAccount?  // Lazy: created only when Stripe functionality is engaged
  activity        UserActivity?

  // 1:N Auth & Session Extensions
  oauthAccounts   OAuthAccount[]
  refreshTokens   RefreshToken[]

  // Domain Inverse Relations (Foreign Key Targets)
  bookings                 Booking[]
  serviceBookings          ServiceBooking[]
  assetBookings            AssetBooking[]
  assetTransactions        EventAssetTransaction[]      @relation("AssetProvider")
  clientEvents             Event[]                      @relation("EventClient")
  organizedEvents          Event[]                      @relation("EventOrganizer")
  appointments             Appointment[]                @relation("AppointmentAppointee")
  appointmentsMade         Appointment[]                @relation("AppointmentAppointedBy")
  appointmentsEnded        Appointment[]                @relation("AppointmentEndedBy")
  organizerEventXp         OrganizerEventXp[]
  serviceTransactions      EventServiceTransaction[]    @relation("ServiceProvider")
  eventTemplates           EventTemplate[]
  venueTransactions        EventVenueTransaction[]      @relation("VenueProvider")
  favorites                Favorite[]
  files                    File[]
  passport                 Passport?
  reviews                  Review[]
  reviewReplies            ReviewReply[]
  assets                   Asset[]
  reviewsGiven             RoleRequest[]                @relation("Reviewer")
  roleRequests             RoleRequest[]                @relation("Applicant")
  services                 Service[]
  venues                   Venue[]
  bookingAttendees         BookingAttendee[]
  invitedAttendees         BookingAttendee[]            @relation("Inviter")
  notifications            Notification[]
  waitlistEntries          Waitlist[]
  payouts                  Payout[]
  ownPromotions            Promotion[]
  foxerSpecializations     FoxerSpecialization[]
  conversationsAsA         Conversation[]               @relation("ConversationUserA")
  conversationsAsB         Conversation[]               @relation("ConversationUserB")
  inboxConversations       Conversation[]               @relation("ConversationGuest")
  messagesSent             Message[]
  posts                    Post[]
  postComments             PostComment[]
  postLikes                PostLike[]
  partnerInvestments       PartnerInvestment[]
  partnerProfile           PartnerProfile?
  partnershipProposals     PartnershipProposal[]
  followers                Follow[]                     @relation("Following")
  following                Follow[]                     @relation("Follower")
  voucherRedemptions       VoucherRedemption[]
  blockedUsers             Block[]                      @relation("Blocker")
  blockedByUsers           Block[]                      @relation("Blocked")
  commentLikes             CommentLike[]
  savedPosts               SavedPost[]
  hiddenPosts              HiddenPost[]
  postMediaTags            PostMediaTag[]
  pollVotes                PollVote[]
  reportsFiled             Report[]
  reportsResolved          Report[]                   @relation("ReportResolvedBy")
  groupConversations       ConversationParticipant[]
  messageReactions         MessageReaction[]
  conversationReads        ConversationRead[]
  conversationSettings     ConversationSettings[]
  eventServiceBids         EventServiceBid[]
  eventAssetBids           EventAssetBid[]
  invoices                 Invoice[]
  bookingEditRequests      BookingEditRequest[]
  venueAffiliations        VenueEventFoxerAffiliation[] @relation("VenueAffiliationEventFoxer")
  venueAffiliationReviews  VenueEventFoxerAffiliation[] @relation("VenueAffiliationReviewer")

  @@map("users")
}
```

### 2.3 Domain Extension Models
```prisma
model UserProfile {
  id        String   @id @default(uuid())
  userId    String   @unique
  phone     String?
  imgId     String?
  address   String?
  city      String?
  state     String?
  country   String?  @default("Philippines")
  isPrivate Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_profiles")
}

model UserSettings {
  id                String   @id @default(uuid())
  userId            String   @unique
  preferredCurrency String   @default("PHP")
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_settings")
}

model PaymentAccount {
  id                       String   @id @default(uuid())
  userId                   String   @unique
  stripeCustomerId         String?  @unique
  stripeChargesEnabled     Boolean  @default(false)
  stripePayoutsEnabled     Boolean  @default(false)
  stripeAccountId          String?  @unique
  stripeOnboardingComplete Boolean  @default(false)
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt

  user                     User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("payment_accounts")
}

model UserActivity {
  id           String    @id @default(uuid())
  userId       String    @unique
  lastActiveAt DateTime? // Authenticated user actions (throttled/debounced)
  lastSeenAt   DateTime? // Real-time socket presence timestamp (NULL on initial migration)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_activity")
}

model OAuthAccount {
  id                String        @id @default(uuid())
  userId            String
  provider          OAuthProvider // GOOGLE | FACEBOOK | APPLE
  providerAccountId String        // Platform user ID (Google sub, FB ID, Apple sub)
  email             String?
  displayName       String?
  avatarUrl         String?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  user              User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
  @@map("oauth_accounts")
}

model RefreshToken {
  id            String    @id @default(uuid())
  userId        String
  jti           String    @unique // Unique JWT ID token identifier
  tokenHash     String?   @unique // Cryptographic hash of rotated secret
  expiresAt     DateTime
  revokedAt     DateTime?
  createdAt     DateTime  @default(now())
  userAgent     String?
  ip            String?
  rotatedAt     DateTime?
  replacedByJti String?

  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
  @@map("refresh_tokens")
}
```

---

## 3. Account-Linking & Security Policy (Facebook / Meta SSO)

To prevent account takeover and profile hijacking, synthetic emails (`fb_{id}@foxpassport.com`) are **strictly prohibited**.

```
                      Facebook OAuth Callback
                                 │
                                 ▼
                     1. Find OAuthAccount by
              (provider=FACEBOOK, providerAccountId)
                                 │
                 ┌───────────────┴───────────────┐
                 │ Found                         │ Not Found
                 ▼                               ▼
          Login existing User             2. Is Facebook email
                                         present & verified?
                                                 │
                                 ┌───────────────┴───────────────┐
                                 │ Yes                           │ No
                                 ▼                               ▼
                      3. Does a User exist with           Reject with 400:
                          that email?                     "Facebook account must have
                                 │                        a verified email address"
                 ┌───────────────┴───────────────┐
                 │ Found                         │ Not Found
                 ▼                               ▼
         4. Is existing User's            5. Create brand-new User
          email verified?                        │
                 │                               ▼
         ┌───────┴───────┐                 Link OAuthAccount
         │ Yes           │ No
         ▼               ▼
   Link OAuthAccount   Require email
   to existing User    verification before
                       merging
```

---

## 4. Atomic Registration Flow & Dual-Write Rollback Safety

### 4.1 Atomic Creation
User provisioning is wrapped in an atomic database transaction:
```ts
await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({
    data: {
      email,
      name,
      username,
      password: passwordHash || null, // Temporary dual-write during Switch window
      passwordHash: passwordHash || null, // Null for OAuth-only users
      phone: mobileNumber, // Temporary dual-write
      isEmailVerified: isOAuth,
    },
  });

  await tx.userProfile.create({
    data: {
      userId: user.id,
      imgId: avatarUrl,
      phone: mobileNumber,
      country: "Philippines",
    },
  });

  await tx.userSettings.create({
    data: {
      userId: user.id,
      preferredCurrency: "PHP",
    },
  });

  await tx.userActivity.create({
    data: {
      userId: user.id,
      lastActiveAt: new Date(),
      lastSeenAt: new Date(),
    },
  });

  if (oauth) {
    await tx.oAuthAccount.create({
      data: {
        userId: user.id,
        provider: oauth.provider,
        providerAccountId: oauth.providerAccountId,
        email: oauth.email,
        displayName: oauth.displayName,
        avatarUrl: oauth.avatarUrl,
      },
    });
  }

  // NOTE: PaymentAccount is intentionally NOT created here.
  // It is created lazily when the user engages Stripe functionality.
  return user;
});
```

### 4.2 Temporary Dual-Writes (Switch Stabilization Window)
During the Switch phase, write operations update both `UserProfile` and the legacy columns (`users.phone`, `users.address`, etc.). This guarantees that if a production rollback is triggered, old code reading legacy columns never encounters stale data. Dual-writes are removed in Stage 4 (Contract).

---

## 5. 4-Stage Rollout: Expand ➔ Migrate ➔ Switch ➔ Contract

### Stage 1: Expand (COMPLETED ON BRANCH)
* `OAuthProvider` enum (`GOOGLE`, `FACEBOOK`, `APPLE`) added.
* Tables created: `user_profiles`, `user_settings`, `payment_accounts`, `user_activity`, `oauth_accounts`.
* `passwordHash String?` added to `users` (`password` column kept temporarily as legacy).
* All legacy columns on `users` (`address`, `city`, `phone`, `imgId`, `stripe*`, `preferredCurrency`, `lastActiveAt`, `googleId`) remain intact.

### Stage 2: Migrate (SQL SCRIPT READY)
* File: `prisma/migrations/20261001170500_add_oauth_accounts/migration.sql`
* Safe SQL backfill copies profiles, settings, Stripe credentials (lazy), activity timestamps, and Google identities into the new tables.
* `lastSeenAt` is explicitly initialized to `NULL` (populated by socket presence at runtime).
* `passwordHash` is populated from `password` only where `password LIKE '$2%'` (bcrypt hashes generated via `bcryptjs`).

### Stage 3: Switch & Automated Test Suite (NEXT STEP)

#### A. Automated Test Matrix (Must pass before production deployment):
1. **OAuthAccount exists** ➔ Logs into existing linked account.
2. **OAuthAccount doesn't exist + verified email matches verified User** ➔ Links account cleanly.
3. **OAuthAccount doesn't exist + email matches unverified User** ➔ Halts with email verification requirement.
4. **OAuthAccount doesn't exist + no matching User + verified email** ➔ Creates User + UserProfile + UserSettings + UserActivity + OAuthAccount atomically.
5. **No verified provider email** ➔ Rejects with 400 error.
6. **Same `providerAccountId`** ➔ Rejects duplicate creation (`@@unique` constraint).
7. **Facebook account A** ➔ Must NEVER authenticate as FoxPassport User B (strict tenant isolation).

#### B. Service Cutover:
* [ ] Switch `profile.service.ts` and `profile.repository.ts` to read/write `user_profiles`.
* [ ] Switch currency handling in `profile.service.ts` to read/write `user_settings`.
* [ ] Switch Stripe Connect services to use `payment_accounts`.
* [ ] Switch socket disconnect presence to update `lastSeenAt` in `user_activity`.

### Stage 4: Pre-Contract Verification & Contract

#### Integrity Check Queries:
```sql
-- Verification 1: Confirm passwordHash migration
SELECT COUNT(*) FROM "users" WHERE "password" IS NOT NULL AND "passwordHash" IS NULL; -- Must be 0

-- Verification 2: Detect orphaned users (must be 0)
SELECT id FROM "users" WHERE id NOT IN (SELECT "userId" FROM "user_profiles");
SELECT id FROM "users" WHERE id NOT IN (SELECT "userId" FROM "user_settings");
SELECT id FROM "users" WHERE id NOT IN (SELECT "userId" FROM "user_activity");

-- Verification 3: Detect dangling references (must be 0)
SELECT id FROM "oauth_accounts" WHERE "userId" NOT IN (SELECT id FROM "users");
SELECT id FROM "payment_accounts" WHERE "userId" NOT IN (SELECT id FROM "users");

-- Verification 4: Duplicate OAuth identities (must be 0)
SELECT "provider", "providerAccountId", COUNT(*) 
FROM "oauth_accounts" 
GROUP BY "provider", "providerAccountId" 
HAVING COUNT(*) > 1;

-- Verification 5: Duplicate Stripe accounts (must be 0)
SELECT "stripeAccountId", COUNT(*) 
FROM "payment_accounts" 
WHERE "stripeAccountId" IS NOT NULL 
GROUP BY "stripeAccountId" 
HAVING COUNT(*) > 1;
```

* **Contract Execution** (Only executed after verification queries return 0 issues):
```sql
ALTER TABLE "users"
  DROP COLUMN IF EXISTS "address",
  DROP COLUMN IF EXISTS "city",
  DROP COLUMN IF EXISTS "state",
  DROP COLUMN IF EXISTS "country",
  DROP COLUMN IF EXISTS "phone",
  DROP COLUMN IF EXISTS "imgId",
  DROP COLUMN IF EXISTS "isPrivate",
  DROP COLUMN IF EXISTS "preferredCurrency",
  DROP COLUMN IF EXISTS "stripeCustomerId",
  DROP COLUMN IF EXISTS "stripeChargesEnabled",
  DROP COLUMN IF EXISTS "stripePayoutsEnabled",
  DROP COLUMN IF EXISTS "stripeAccountId",
  DROP COLUMN IF EXISTS "stripeOnboardingComplete",
  DROP COLUMN IF EXISTS "lastActiveAt",
  DROP COLUMN IF EXISTS "googleId",
  DROP COLUMN IF EXISTS "password"; -- Deprecated in favor of passwordHash
```

---

## 6. Rollback Strategy

```
Expand ──► Migrate ──► Switch (Dual-Write) ──► Verify ──► Contract
                             │
                             └── If failure occurs during stabilization:
                                 1. Revert application code to previous release.
                                 2. Because dual-writes were active, legacy columns
                                    have fresh data.
                                 3. Zero data loss; zero user interruption.
```
