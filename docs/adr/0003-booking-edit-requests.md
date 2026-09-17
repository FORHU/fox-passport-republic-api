# Booking edit requests and provider-initiated cancellation (Asset/Service bookings)

Before this decision, a citizen who needed to change guest count/quantity or dates on
an existing paid Asset/Service booking had exactly one option: cancel and rebook from
scratch. Cancelling itself had a second problem — `AssetBookingSvc`/`ServiceBookingSvc`
cancellation just flipped `status` to `cancelled`; no `Refund` row, no Stripe refund
call. Money was lost with zero audit trail. Provider-initiated cancellation (the
provider can't deliver — gear broke, double-booked) had no path at all.

We decided:

- **Scope: Asset & Service bookings only, not venue/event `Booking`.** The venue/event
  flow already has full `CancellationPolicy` + `Refund` + Stripe-refund infrastructure
  ([0002](./0002-stripe-connect-payouts.md)), but is multi-provider (Mayor + Foxers +
  Host on one `Booking`), so "which provider cancels what" needs its own design —
  deferred to a later pass.
- **Repricing reuses `calculateItemsTotal`, never re-derives pricing logic.** A
  `BookingEditRequest`'s `proposedTotalAmount` is computed by re-running the exact same
  `calculateItemsTotal({price, quantity, startDate, endDate, billingRate})` call
  `AssetBookingSvc.create`/`ServiceBookingSvc.create` already use, against the current
  listing price and the proposed quantity/dates — never trusted from the client, never
  a second pricing formula to keep in sync.
  - `ServiceBooking` guest count is capacity only, not a price input —
    `ServiceBookingSvc.create` always passes `quantity: 1` to `calculateItemsTotal`.
    So a guest-count-only edit on a service booking always has `priceDelta === 0`; only
    a date change (which shifts the billing-period count) can move the price.
- **The price difference is charged or refunded, not silently absorbed.** On provider
  approval: `priceDelta > 0` creates a Stripe PaymentIntent for the difference and the
  booking's fields don't change until that's confirmed paid (`confirmDeltaPayment`);
  `priceDelta < 0` fires an immediate partial Stripe refund and applies the change
  right away; `priceDelta === 0` applies immediately. This mirrors Airbnb's alteration-
  request model rather than Agoda's cancel-and-rebook-only model.
- **Provider-initiated cancellation is always a full refund, no cancellation-policy
  tiers.** The citizen didn't cause the cancellation, so they don't eat a fee the way a
  citizen-initiated cancellation would. `AssetBookingSvc.providerCancel`/
  `ServiceBookingSvc.providerCancel` refund 100% of whatever was paid unconditionally.
- **`Refund` is generalized to cover Asset/Service bookings.** It previously only
  related to the venue/event `Booking` + generic `Payment` model. Asset/Service
  bookings settle through their own `paymentTransactionId` field, not a `Payment` row,
  so `Refund` gained nullable `assetBookingId`/`serviceBookingId` columns (and
  `paymentId` became nullable) rather than forcing a fake `Payment` row into existence
  just to satisfy the old required relation.
- **Availability is re-validated at approval time, not just at request time.** The slot
  a citizen requested may have filled in the time it took the provider to respond, so
  `BookingEditRequestSvc.approve` re-runs the same conflict check `create` did before
  actually applying anything.
- **A pending request auto-expires after 48h**, checked lazily on read/approve/decline
  rather than via a new cron job — consistent with there being no existing scheduled-job
  infrastructure in this codebase to plug into.

Considered and rejected: letting the citizen apply guest-count/date changes unilaterally
without provider approval (simpler, but the provider may not actually have the
capacity/availability for the new request — this is exactly the failure mode a "smooth
flow for the user" is supposed to prevent); carving the price delta out of an existing
Payment record instead of a fresh PaymentIntent/refund (would tangle the delta's
lifecycle with the original payment's, when they're logically independent events).
