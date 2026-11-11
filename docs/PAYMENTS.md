# Payments — how money moves through FoxPassport Republic

**Written 15 Sep 2026**, from a full trace of the current code (not just the docs it started from); §1, §2 and §5 updated 11 Nov 2026 for the Event payment breakdown (#264). Companion to `docs/adr/0009-event-commission-and-category-fees.md` (which replaces `docs/adr/0001-host-markup-and-server-computed-event-total.md`) and `docs/adr/0002-stripe-connect-payouts.md` — those record _why_ the original decisions were made; this records _what the system actually does today_, including where it has drifted from those decisions. See the **Summary of gaps** at the end for the drift.

There are **two parallel checkout systems** in this codebase today, sharing one Stripe account and one `Payment`/`Payout`/`Refund` ledger:

- **Direct booking** — Asset, Service, or Venue booked outright, or an Event booked from a template. The original system.
- **Central Payment** — a newer, generic Invoice → Checkout → Payment → Payout pipeline. Currently only used for two things: paying for an Event's already-accepted vendor transactions in one consolidated checkout, and paying an accepted sponsorship proposal.

Neither replaces the other. Know which one a given screen is using before you touch it.

---

## 1. The money model

### 1a. Event pricing: the per-line breakdown (#264, Nov 2026)

Every Foxer line on an Event (venue, gear, service) is priced on its own, then summed. Decided in ADR 0009, which replaces ADR 0001.

```
per line:
  price          = the Foxer's own listing price (× quantity for gear);
                   an approved venue affiliation's agreed price counts as the Mayor's own
  commission     = price × EventFoxer's commissionPct / 100     → paid to the EventFoxer
  platformFee    = price × fee rule % / 100                    → kept by FoxPassport
  processingFee  = price × PROCESSING_FEE_PERCENT / 100 (3%)   → kept by FoxPassport
  lineTotal      = price + commission + platformFee + processingFee
each amount rounded half-up to 2 decimals per line; Event totals are sums of the rounded lines
```

- **Commission:** one rate per EventFoxer (`users.commissionPct`, 0–100), set with `GET`/`PUT /v1/profile/commission`. It applies to every Event they run. An Event copies the rate when it is created (`events.commissionPct`), so a later change never moves a booked Event's price.
- **FoxPassport fee:** set by the admin per category, through `PlatformFeeConfig` rules with `transactionType = "event_item"` (`category` = item type, `subcategory` = listing category). The most specific rule wins. A default rule (5%, migration `20261109130000_add_default_event_item_fee_rule`) covers everything else. The fee is charged on the Foxer price only, never on the commission.
- **Processing fee:** `PROCESSING_FEE_PERCENT` (default 3%), checked at startup.
- **Code:** the pure maths is `buildEventBreakdown` in `src/modules/pricing/event-breakdown.ts`; `PricingSvc.calculateEventBreakdown` adds the fee rules. It prices Events in `BookingSvc.bookFromTemplate` and `EventRequestSvc.spawnRequestFromTemplate`, their lines in `EventTransactionSvc.createTransactionsFromTemplate`, an item added after booking in `BookingSvc.addAdHocItem`, and the template's displayed price in `EventTemplateSvc.getTemplateById`. Event checkout uses `calculateEventBreakdownForLines` for a line with no stored snapshot. On these paths the client never supplies a price. `EventRequestSvc.createDirectEvent` doesn't use it: a direct Event has no Foxers, so it stores `totalAmount: 0` and no rate, and ignores a client-sent total. Matching a Foxer (`matchItem`/`respondToMatch`) prices nothing.
- **Stored:** the Event stores `commissionPct`, `itemsTotal`, `hostMarkupAmount` (= the commission total), `platformFeeAmount`, `processingFeeAmount` and `totalAmount`. Each transaction row stores its line's snapshot: `category`, `commissionPct`, `commissionAmount`, `platformFeePct`, `platformFeeAmount`, `processingFeeAmount`.
- **Older Events** (`commissionPct` null) keep the old Host Markup pricing and checkout.
- **Vouchers** aren't offered on these Events yet (`VOUCHERS_NOT_OFFERED_ON_EVENTS`).

Worked example (10% commission): venue 10,000 (5% default fee) + catering 5,000 (6% catering rule) = 15,000 + 1,500 commission + 800 fees + 450 processing = **17,750**.

Direct single-provider bookings and booking edit requests resolve their fee via `PricingSvc.resolvePricingRule` with the `PLATFORM_FEE_PERCENT` fallback (§1b).

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

**Event checkout (#264, Nov 2026):** an Event priced with the breakdown (§1a) doesn't use this formula. `EventCheckoutSvc` charges each payable line's stored snapshot: price, commission, FoxPassport fee and processing fee. A line with no snapshot yet (an item added after booking) is priced at checkout with the Event's own rate, and its snapshot is stored then. The invoice's `platformFeeSnapshot` records every line (`kind: "event_breakdown"`; written and read only through `src/modules/payment/event-breakdown-snapshot.ts`). Refunds and payouts read the amounts from there. Older Events still go through `calculatePrice`.

---

## 2. Getting paid: Stripe Connect

**Onboarding.** Every supply-side role — Venue, Gear, Service, Performer, Event Foxer — holds `payouts:onboard` (`src/types/permissions.ts`) and onboards identically: `StripeConnectSvc.createExpressAccount` creates a Stripe Express account, `createOnboardingLink` returns Stripe's hosted onboarding URL. The `account.updated` webhook keeps `User.stripeChargesEnabled`/`stripePayoutsEnabled`/`stripeOnboardingComplete` current.

**Mechanism.** Separate Charges and Transfers: the citizen's payment always lands in the platform's own Stripe balance first. Money moves out later, per recipient, via `stripe.transfers.create({ destination: ... })` — one shared function, `PayoutSvc.fireTransfer` (`src/modules/payout/payout.service.ts:54-103`), used by both checkout systems. No `stripeAccountId`/`stripePayoutsEnabled` → the `Payout` is marked `failed`, no transfer attempted. Idempotent by `@@unique([sourceType, sourceId, providerId])` on `Payout` — a retried webhook can't double-pay.

**Timing, as it is on `staging` (Nov 2026):**

|                | Event lines (direct booking or Central Payment)                                                                                                                                                                                                | Sponsorships (Central Payment)                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Payout fires   | Only when the booking reaches `completed` (`PayoutSvc.createPayoutsForEventBooking`)                                                                                                                                                           | Immediately when the Stripe webhook confirms payment (`allocatePayouts`)                                         |
| Gate           | Check-in / confirmed arrival; a `dispute` blocks it                                                                                                                                                                                            | None                                                                                                             |
| Paid out       | Each Foxer: their line's stored price. The EventFoxer: the commission the paid invoice charged, on lines not rejected or cancelled (an older Event: its `hostMarkupAmount`). Investors with a revenue share take their cut out of the owner's. | Proposal amount minus proportional platform fee and a mocked gateway fee (`itemAmount * 0.029 + 15 * itemRatio`) |
| Never paid out | The FoxPassport fee and the processing fee                                                                                                                                                                                                     | The platform fee                                                                                                 |

Event lines follow ADR-0002 ("trade a payout delay for materially lower clawback risk"). `allocatePayouts` deliberately skips event transactions, so they aren't paid twice. Sponsorships still pay on payment success, pending a product decision (#264 Q8).

**The escrow-sounding fields are dead.** `EventAssetTransaction`/`EventServiceTransaction`/`EventVenueTransaction` have `lockedAt`/`releasedAt`/`stripeTransferId`/`disputeReason`/`disputeAt` columns (`prisma/schema/event.prisma`). Nothing in `src/` reads or writes them. There is no "locked in escrow, awaiting release" state actually modeled anywhere — treat `Payout.status` (`pending`/`paid`/`failed`) as the real, current state machine. Dispute state for a booking lives on the `Booking`/`AssetBooking`/`ServiceBooking` row itself (`ItemBookingStatus.disputed`), not on these transaction rows.

---

## 3. Central Payment — the models

All in `prisma/schema/money.prisma`, spread across `src/modules/payment/` and `src/modules/checkout/` (there is no `central-payment` module despite the name):

| Model                                         | Purpose                                                                                                    |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `Invoice`                                     | What's owed, by whom — subtotal/discount/platform fee/gross, `status`                                      |
| `InvoiceItem`                                 | Line items, each pointing at a `sourceType`/`sourceId` (booking, an event transaction, a sponsorship, ...) |
| `Checkout`                                    | One Stripe Checkout Session attempt against an Invoice                                                     |
| `Payment`                                     | One payment attempt/result — **shared with the direct-booking flow**, now invoice-scoped                   |
| `Payout`                                      | One transfer to one provider for one source — also shared                                                  |
| `Refund`                                      | One refund against a `Payment`                                                                             |
| `Voucher` / `Promotion` / `VoucherRedemption` | Discount codes (§6)                                                                                        |
| `PlatformFeeConfig`                           | Admin-configurable fee rules                                                                               |
| `PaymentProviderEvent`                        | Webhook idempotency log                                                                                    |

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

**Event cancellation (Central Payment, #264).** `EventCheckoutSvc.cancelEvent` refunds each line separately, at its own Foxer's policy %.

- The % applies to the **whole line**: price + commission + FoxPassport fee + processing fee. A 100% policy returns everything the client paid for it.
- A line never refunds more than what's left on it after earlier refunds, such as an admin's.
- Only the Foxer's share (the price's share of the refund) is clawed back from their payout. The reversal names the Foxer, so an investor's payout on the same line is never the one reversed.
- Stripe keeps its own fee on a refund; FoxPassport absorbs it.
- Refunds that come back `pending` (wallets such as GCash) count toward the total.

`AdminSvc.createItemizedRefund` caps a refund at the line's total on the paid invoice, minus every earlier refund on that line, including the cancellation's. It claws back the Foxer's price share and the EventFoxer's commission share.

Failure handling: `getFailedRefunds`, `getFailureReason` (polls Stripe for the real reason), `retryRefund`, `resolveManual` (admin marks resolved without a real Stripe retry). `refund.updated` webhooks (`failed`/`succeeded`) route through the **old** flow's dispatcher — both systems share one Stripe account, so a Central-Payment-originated refund still needs to arrive as this same event type.

---

## 6. Disputes

Two mechanisms, not equivalent:

1. **Booking-level dispute** — the booker reports a dispute (`AssetBookingSvc.dispute`/`ServiceBookingSvc.dispute`), moving status to `disputed`. This is what actually blocks a payout: it keeps the booking from ever reaching `completed`, which is the trigger `PayoutSvc` waits for.
2. **Refund dispute queue** — `AdminSvc.getDisputes` reads disputed `Refund` rows; an admin approves (retries the refund) or rejects.

**Resolution (Oct 2026):** `AdminSvc.resolveAssetBookingDispute` and `AdminSvc.resolveServiceBookingDispute` now explicitly invoke `PayoutSvc.createPayoutsForAssetBooking` / `PayoutSvc.createPayoutsForServiceBooking` when the admin resolves the dispute with status `completed` (in the provider's favor), guaranteeing payouts are unblocked and created.

---

## 7. Vouchers

`Promotion` (the discount rule — percentage/fixed, min subtotal, max discount, usage limits, active window) + `Voucher` (one redeemable code per Promotion) + `VoucherRedemption` (one redemption, unique per invoice). Pure discount mechanism — no wallet/credit system exists anywhere in the schema; a discount only ever reduces what's owed on that one invoice.

Validated and priced by `PricingSvc.validateAndCalculateVoucher` — active window, min subtotal, transaction-type/category match, both global and per-user usage limits. The `VoucherRedemption` row is only created inside `WebhookSvc.handlePaymentSuccess`, gated on the invoice's discount snapshot — an abandoned or failed checkout never redeems the voucher. Central Payment / Event checkout only; sponsorship checkout accepts a `voucherCode` server-side but has no voucher UI wired up on the frontend.

---

## Summary of gaps worth someone's attention

1. **`EventTemplate.platformFeePct` is write-only** — _(Superseded Nov 2026)_ Event fees now come from `event_item` fee rules per category (§1a); the template column is deprecated.
2. **Client-suppliable `totalAmount` on direct venue bookings** — the one place in the system where "never trust the client's price" isn't enforced. (§1b)
3. **Central Payment never charges Host Markup.** _(Resolved Nov 2026, #264)_ Event checkout charges every line's commission. (§1c)
4. **Central Payment pays out immediately on payment success** — _(Resolved for Events)_ Event lines are paid at `completed`; only sponsorships still pay on payment success (#264 Q8). (§2)
5. **The `lockedAt`/`releasedAt`/`stripeTransferId` escrow fields on `Event*Transaction` are dead code.** Don't design against them; `Payout.status` is the real state machine. (§2)
6. **Admin dispute resolution can silently skip the payout trigger** — _(Resolved Oct 2026)_ Admin dispute resolution services now invoke `PayoutSvc` directly on `completed` resolutions. (§6)
7. **A matched (`approved`) venue row is never charged at Event checkout** (it only invoices `pending` venue rows) but is still paid out at `completed`. Predates #264; open question. (§1c, §2)

See `PRICING-ADMINISTRATION-PRODUCT.md` for the product-management position on gaps 1 and 3 above (platform fee and voucher/promotion configuration) — it treats "the schema supports it" and "an administrator can operate it" as two different completion states, and sets Platform Fee Administration as Priority 1 for closing the gap.
