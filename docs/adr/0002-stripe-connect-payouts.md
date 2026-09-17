# Provider payouts via Stripe Connect Express, using Separate Charges and Transfers

Before this decision, citizen payments went straight into the platform's own Stripe
account via a plain PaymentIntent ([payment.service.ts:18-41](../../src/services/payment.service.ts#L18-L41)).
`agreedPrice`/`hostMarkupPercent` only ever produced ledger rows recording what each
Mayor/Foxer/Host was owed — no money ever actually moved to them. Turning that into
real profit requires Stripe Connect.

We decided:

- **Account type: Express.** Mayor/Foxer/Host onboard via Stripe-hosted
  ID-verification + bank-account flow. Minimal compliance burden on the platform
  compared to Custom, faster to integrate than building our own KYC UI, and a good
  fit for many small individual providers rather than the handful of large merchants
  Standard assumes.
- **Split mechanism: Separate Charges and Transfers**, not destination charges. An
  Event booking fans out to multiple recipients at once (Mayor + one or more Foxers +
  Host + platform), and a single PaymentIntent can only route to one destination
  account — destination charges can't express that. So every flow (single-provider
  Asset/Service booking and multi-provider Event booking alike) uses the same
  pattern: the full citizen payment lands in the platform's account first, then a
  `Transfer` is created per recipient for their share. One mechanism everywhere,
  rather than destination charges for the simple case and something else for Events.
- **Payout timing: on status → `completed`.** A Transfer only fires once the booking
  reaches `completed` (i.e. after `confirmArrival` with no dispute filed), reusing
  the dispute/escrow status machine that already exists
  ([asset-booking.service.ts](../../src/services/asset-booking.service.ts)). If a
  dispute is filed first, no transfer happens until it's resolved. This trades a
  payout delay for materially lower clawback risk versus transferring at payment
  time.
- **Platform fee is additive, not carved out.** Citizen pays
  `itemsTotal + hostMarkup + platformFee`; Mayor/Foxer receive their full
  `agreedPrice` and Host their full markup, untouched. The platform fee is a visible
  extra line item rather than a hidden cut taken from providers' shares.

Considered and rejected: destination charges + `application_fee_amount` (clean for a
single recipient, but doesn't support the multi-provider fan-out an Event requires);
transferring immediately on payment success (simpler, but pays providers before the
asset/service/event has even happened, creating refund/clawback exposure); carving
the platform fee out of providers' shares instead of adding it on top (would make
the citizen-facing total match what's quoted today, but silently reduces what
Mayor/Foxer/Host actually receive).

## Addendum: why there are two payout-computing services

`src/modules/payout/payout.service.ts` (`PayoutSvc`) and
`src/modules/payment/payout.service.ts` (`PaymentPayoutSvc`) both end up calling
`PayoutSvc.fireTransfer` — the one and only place `stripe.transfers.create` is
called — but they compute the amount to transfer differently, because they answer
to two different payment paths that both existed before Central Payment unified
anything:

- **`PayoutSvc`** fires the moment a `Booking`/`AssetBooking`/`ServiceBooking`
  reaches `completed` (the flow this ADR was written for). Each recipient gets
  their full `agreedPrice`/`totalAmount - platformFeeAmount` — the platform fee is
  additive, per the decision above, so there's no fee math to do per-payout here.
- **`PaymentPayoutSvc`** fires from `webhook.service.ts` the moment a Central
  Payment `Invoice` is marked `paid` — the newer, invoice-based checkout flow
  (`EventCheckoutSvc`, `PartnershipCheckoutSvc`). It has to derive each line item's
  share of the invoice's already-computed `platformFeeAmount` proportionally, plus
  a modeled gateway fee, because an Invoice's fee is computed once for the whole
  invoice, not per line item.

Both are real, live entry points — a booking can be paid through either the old
direct-PaymentIntent flow or the newer Invoice/Checkout flow depending on which
frontend flow reaches it (see `docs/CENTRAL-PAYMENT-FRONTEND-PLAN.md` in the app
repo) — so this isn't dead duplication to delete, but it is legitimately two
implementations of "how much does this fee model leave for the recipient." Logic
that doesn't depend on which fee model was used — splitting a resolved amount with
an investor's `revenueSharePercent` — is factored into one shared, pure function
both call: `PayoutSvc.resolveInvestorSplit`. If a third payout-computing path is
ever added, put its investor-split logic through that same function rather than
copying the loop again.
