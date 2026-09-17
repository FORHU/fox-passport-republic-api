# Payments — how money moves through FoxPassport Republic

**Written 15 Sep 2026**, from a full trace of the current code (not just the docs it started from). Companion to `docs/adr/0001-host-markup-and-server-computed-event-total.md` and `docs/adr/0002-stripe-connect-payouts.md` — those record *why* the original decisions were made; this records *what the system actually does today*, including two places where it has drifted from those decisions. See §7 for the drift.

There are **two parallel checkout systems** in this codebase today, sharing one Stripe account and one `Payment`/`Payout`/`Refund` ledger:

- **Direct booking** — Asset, Service, or Venue booked outright, or an Event booked from a template. The original system.
- **Central Payment** — a newer, generic Invoice → Checkout → Payment → Payout pipeline. Currently only used for two things: paying for an Event's already-accepted vendor transactions in one consolidated checkout, and paying an accepted sponsorship proposal.

Neither replaces the other. Know which one a given screen is using before you touch it.

---

## 1. The money model

### 1a. Event-from-template pricing (Host Markup + Platform Fee)

```
itemsTotal         = sum of included EventTemplateAsset/Service/Venue.agreedPrice
hostMarkupAmount   = itemsTotal * (template.hostMarkupPct / 100)
platformFeeAmount  = (itemsTotal + hostMarkupAmount) * (PLATFORM_FEE_PERCENT / 100)
totalAmount        = itemsTotal + hostMarkupAmount + platformFeeAmount
```

`EventTemplateSvc.calculateTotalsBreakdown` (`src/modules/event-template/event-template.service.ts:347-375`), called from `BookingSvc.bookFromTemplate` (`src/modules/booking/booking.service.ts:776-836`). The citizen only ever supplies `templateId` + dates + exclusions — never a price. All four numbers land on `Event` (`totalAmount`, `itemsTotal`, `hostMarkupAmount`, `platformFeeAmount`).

**Gap:** `platformFeePercent` here always comes from the global env constant `PLATFORM_FEE_PERCENT` (`src/config.ts`, default 5%) — **not** from the per-template `EventTemplate.platformFeePct` column (schema default 0.05). `bookFromTemplate` never passes that column into the calculation. The per-template override exists in the schema but is currently write-only and has no effect.

### 1b. Direct single-provider bookings (Asset / Service / Venue) — no Host Markup

```
itemsTotal          = calculateItemsTotal({ price, quantity, startDate, endDate, billingRate })
effectiveFeePercent = ownerHasLowerFees ? 0 : PLATFORM_FEE_PERCENT   // "lower_fees" Passport perk
platformFeeAmount   = itemsTotal * (effectiveFeePercent / 100)
totalAmount         = itemsTotal + platformFeeAmount
```

`AssetBookingSvc.create` (`src/modules/asset-booking/asset-booking.service.ts:42-95`), `ServiceBookingSvc` mirrors it. `src/utils/pricing.ts` (`calculateItemsTotal`, `calculateBillingPeriods`, `toStripeCents`) is the shared arithmetic — no pricing policy of its own.

**Gap — this one is a real risk, not just documentation drift:** the direct **venue** booking path in `BookingSvc.createBooking` does:

```ts
const totalAmount = data.totalAmount || itemsTotal.add(platformFeeAmount);
// src/modules/booking/booking.service.ts:204-206
```

If the client sends a truthy `totalAmount`, **it's used instead of the server-computed value** — for the `Booking`/`Event.totalAmount` and for what's actually charged via `PaymentSvc.createPayment`. Every other path in the system enforces "never trust the client's price"; this one code path doesn't. Worth fixing before it's exploited.

### 1c. Central Payment's pricing engine (`PricingSvc`) — a third, separate formula

```
subtotal → (voucher discount, if any) → discountedSubtotal → (+ platformFee from PlatformFeeConfig) → finalAmount
```

`PricingSvc.calculatePrice` (`src/modules/pricing/pricing.service.ts:171-239`). Platform fee here comes from an admin-configurable `PlatformFeeConfig` table matched by transaction type/category, resolved by specificity (`resolvePricingRule`, same file, lines 37-79) — a completely separate mechanism from the flat `PLATFORM_FEE_PERCENT` env constant used in §1a/§1b.

**Gap:** `PricingSvc` has no concept of Host Markup at all. An Event's Central Payment invoice sums only the `agreedPrice` of each accepted venue/asset/service transaction — Host Markup is never charged through this path. Confirm with the team whether that's intentional (Host Markup only applies at original booking time) or a real gap.

---

## 2. Getting paid: Stripe Connect

**Onboarding.** Every supply-side role — Venue, Gear, Service, Performer, Event Foxer — holds `payouts:onboard` (`src/types/permissions.ts`) and onboards identically: `StripeConnectSvc.createExpressAccount` creates a Stripe Express account, `createOnboardingLink` returns Stripe's hosted onboarding URL. The `account.updated` webhook keeps `User.stripeChargesEnabled`/`stripePayoutsEnabled`/`stripeOnboardingComplete` current.

**Mechanism.** Separate Charges and Transfers: the citizen's payment always lands in the platform's own Stripe balance first. Money moves out later, per recipient, via `stripe.transfers.create({ destination: ... })` — one shared function, `PayoutSvc.fireTransfer` (`src/modules/payout/payout.service.ts:54-103`), used by both checkout systems. No `stripeAccountId`/`stripePayoutsEnabled` → the `Payout` is marked `failed`, no transfer attempted. Idempotent by `@@unique([sourceType, sourceId, providerId])` on `Payout` — a retried webhook can't double-pay.

**Timing — the two systems disagree, and this matters:**

| | Direct booking | Central Payment |
|---|---|---|
| Payout fires | Only when booking status reaches `completed` | Immediately when the Stripe webhook confirms payment |
| Gate | Check-in / confirmed arrival; a `dispute` blocks it | None — no wait for completion, check-in, or a dispute window |
| Provider receives | Full `agreedPrice`, no deduction (Event fan-out) | `agreedPrice` minus proportional platform fee **and** a mocked gateway fee (`itemAmount * 0.029 + 15 * itemRatio`) |

Direct-booking timing matches ADR-0002's stated rationale ("trade a payout delay for materially lower clawback risk"). Central Payment does not — it pays out on payment success with none of that protection. Flag this to whoever owns product risk here; it may be an intentional V1 simplification, but it's a real divergence from the documented design.

**The escrow-sounding fields are dead.** `EventAssetTransaction`/`EventServiceTransaction`/`EventVenueTransaction` have `lockedAt`/`releasedAt`/`stripeTransferId`/`disputeReason`/`disputeAt` columns (`prisma/schema/event.prisma`). Nothing in `src/` reads or writes them. There is no "locked in escrow, awaiting release" state actually modeled anywhere — treat `Payout.status` (`pending`/`paid`/`failed`) as the real, current state machine. Dispute state for a booking lives on the `Booking`/`AssetBooking`/`ServiceBooking` row itself (`ItemBookingStatus.disputed`), not on these transaction rows.

---

## 3. Central Payment — the models

All in `prisma/schema/money.prisma`, spread across `src/modules/payment/` and `src/modules/checkout/` (there is no `central-payment` module despite the name):

| Model | Purpose |
|---|---|
| `Invoice` | What's owed, by whom — subtotal/discount/platform fee/gross, `status` |
| `InvoiceItem` | Line items, each pointing at a `sourceType`/`sourceId` (booking, an event transaction, a sponsorship, ...) |
| `Checkout` | One Stripe Checkout Session attempt against an Invoice |
| `Payment` | One payment attempt/result — **shared with the direct-booking flow**, now invoice-scoped |
| `Payout` | One transfer to one provider for one source — also shared |
| `Refund` | One refund against a `Payment` |
| `Voucher` / `Promotion` / `VoucherRedemption` | Discount codes (§6) |
| `PlatformFeeConfig` | Admin-configurable fee rules |
| `PaymentProviderEvent` | Webhook idempotency log |

Key services: `InvoiceSvc` (`invoice.service.ts`), `CheckoutSvc` + `StripeAdapter` (Stripe Checkout Session creation), `EventCheckoutSvc` (builds invoice items from an Event's accepted transactions, uses a Postgres advisory lock to serialize concurrent checkout creation for the same event), `PartnershipCheckoutSvc` (same pattern for sponsorships), `WebhookSvc` (idempotent webhook processing → marks paid → redeems voucher → `allocatePayouts`).

**One Stripe webhook endpoint** handles both systems: `POST /v1/payments/webhook` → `PaymentController.handleWebhook` branches by event type. `checkout.session.completed`/`.expired` → `WebhookSvc` (Central Payment). Everything else (`payment_intent.succeeded`, `charge.refunded`, `refund.updated`, `account.updated`) → the original `PaymentSvc.handleStripeEvent`.

---

## 4. The checkout UX — two flows, both card-only via Stripe

### Flow A — Direct booking (embedded Stripe Elements)

1. Book an Asset/Service/Venue → `Booking` + `Payment(pending)` created server-side.
2. `POST /v1/payments/create-intent` → Stripe `PaymentIntent` → `clientSecret` returned.
3. `CheckoutClient.tsx` mounts Stripe `<Elements>` in-page — card entered without leaving the site.
4. `payment_intent.succeeded` webhook → `Payment` marked paid, booking → `confirmed`.
5. Redirect to `/checkout/success` (no query param) → old-flow success screen.

### Flow B — Event / Sponsorship (Stripe-hosted Checkout Session, Central Payment)

1. `EventPaymentPanel.tsx` loads `GET /v1/events/:eventId/payment-summary` for a live preview (Subtotal/Discount/Fee/Total) — no Invoice created yet.
2. Optional voucher code entered, re-previews with the discount applied.
3. **Pay Now** → `POST /v1/events/:eventId/checkout` → `Invoice` + `Checkout` + Stripe Checkout Session created, returns a hosted `url`.
4. Hard navigation (`window.location.href = url`) to Stripe's page — off-origin, can't be an SPA transition.
5. Stripe redirects back to `/checkout/success?invoiceId=...`.
6. Presence of `?invoiceId` routes to `CentralPaymentStatusClient` instead of the old success screen. It does **not** trust the redirect — it polls `GET /v1/invoices/:invoiceId` every 2s (keyed off `paymentStatus`, not `status`) until a terminal state, showing a "still confirming" message after 15s if the webhook hasn't landed.
7. Server-side, the `checkout.session.completed` webhook marks the Invoice paid and fires payouts immediately (§2).

Sponsorship checkout is the identical pattern via `ProposalActions.tsx` → `POST /v1/partnerships/:proposalId/checkout`.

---

## 5. Refunds

`RefundSvc` (`src/modules/refund/refund.service.ts`). Triggered by citizen-initiated cancellation (`BookingSvc.cancelWithRefunds`), which resolves the applicable `CancellationPolicy` (template's, else the booked venue's, else the booked service's), computes the refund percent from `CancellationRule`s sorted by `hoursBeforeEvent`, cancels any still-pending Stripe `PaymentIntent`, and creates a `Refund` for anything already paid. `checkEligibility` is the read-only "what would I get back" preview.

Failure handling: `getFailedRefunds`, `getFailureReason` (polls Stripe for the real reason), `retryRefund`, `resolveManual` (admin marks resolved without a real Stripe retry). `refund.updated` webhooks (`failed`/`succeeded`) route through the **old** flow's dispatcher — both systems share one Stripe account, so a Central-Payment-originated refund still needs to arrive as this same event type.

---

## 6. Disputes

Two mechanisms, not equivalent:

1. **Booking-level dispute** — the booker reports a dispute (`AssetBookingSvc.dispute`/`ServiceBookingSvc.dispute`), moving status to `disputed`. This is what actually blocks a payout: it keeps the booking from ever reaching `completed`, which is the trigger `PayoutSvc` waits for.
2. **Refund dispute queue** — `AdminSvc.getDisputes` reads disputed `Refund` rows; an admin approves (retries the refund) or rejects.

**Gap:** `AdminSvc.resolveAssetBookingDispute`/`resolveServiceBookingDispute` write the booking status directly via plain `prisma.assetBooking.update`/`.serviceBooking.update` calls — they bypass `AssetBookingSvc.updateStatus`/`ServiceBookingSvc.updateStatus`, which is where the payout-on-`completed` trigger actually lives. If an admin resolves a dispute by setting status to `completed`, **the provider's payout does not automatically fire.** Reads like an oversight, not a deliberate choice — an admin ruling in the provider's favor should presumably still pay them.

---

## 7. Vouchers

`Promotion` (the discount rule — percentage/fixed, min subtotal, max discount, usage limits, active window) + `Voucher` (one redeemable code per Promotion) + `VoucherRedemption` (one redemption, unique per invoice). Pure discount mechanism — no wallet/credit system exists anywhere in the schema; a discount only ever reduces what's owed on that one invoice.

Validated and priced by `PricingSvc.validateAndCalculateVoucher` — active window, min subtotal, transaction-type/category match, both global and per-user usage limits. The `VoucherRedemption` row is only created inside `WebhookSvc.handlePaymentSuccess`, gated on the invoice's discount snapshot — an abandoned or failed checkout never redeems the voucher. Central Payment / Event checkout only; sponsorship checkout accepts a `voucherCode` server-side but has no voucher UI wired up on the frontend.

---

## Summary of gaps worth someone's attention

1. **`EventTemplate.platformFeePct` is write-only** — the per-template fee override is never actually used; every template gets the flat global rate. (§1a)
2. **Client-suppliable `totalAmount` on direct venue bookings** — the one place in the system where "never trust the client's price" isn't enforced. (§1b)
3. **Central Payment never charges Host Markup.** Confirm whether that's intentional. (§1c)
4. **Central Payment pays out immediately on payment success, with no completion/dispute gate** — a real divergence from ADR-0002's rationale, not just an implementation detail. (§2)
5. **The `lockedAt`/`releasedAt`/`stripeTransferId` escrow fields on `Event*Transaction` are dead code.** Don't design against them; `Payout.status` is the real state machine. (§2)
6. **Admin dispute resolution can silently skip the payout trigger** by writing booking status directly instead of through the service layer that fires it. (§6)

None of these were fixed as part of writing this doc — it's a map of what's there today, not a changeset.

See `PRICING-ADMINISTRATION-PRODUCT.md` for the product-management position on gaps 1 and 3 above (platform fee and voucher/promotion configuration) — it treats "the schema supports it" and "an administrator can operate it" as two different completion states, and sets Platform Fee Administration as Priority 1 for closing the gap.
