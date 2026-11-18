# Suppliers declining a booked event, and Event Foxers editing it

**Status: proposed (draft).** The five decisions under "Open decisions" are
proposals, not agreed. Nothing here is built. Epic:
[#371](https://github.com/FORHU/fox-passport-republic-api/issues/371); this
API's sub-issue is [#372](https://github.com/FORHU/fox-passport-republic-api/issues/372).
It is the "needs its own design" that [0003](./0003-booking-edit-requests.md)
deferred for venue and event bookings.

## Context

When a citizen books an Event Foxer's event (`BookingSvc.bookFromTemplate`),
every Supplier in it is booked at once: the venue's Mayor and each Provider whose
asset or service is attached. Today:

- **Availability is checked once, at booking.** Every venue, asset, service and
  Provider calendar is locked and checked, and a clash refuses the booking.
  Accepting the booking (`acceptMatch`) checks nothing again.
- **Only the venue looks at `matched`.** `EventTemplateAsset`,
  `EventTemplateService` and `EventTemplateVenue` all carry `matched`, but
  `bookFromTemplate` reads it only for the venue (matched is `approved`,
  unmatched is `pending`). Every asset and service starts at `pending`, matched
  or not.
- **A Supplier cannot decline.** `TransactionStatusSvc` `ALLOWED_TRANSITIONS`
  has no way out of `pending` or `approved` other than the citizen's `cancel`.
  A Provider or Mayor can only `confirm` or `reject` a row that is in
  `pending_provider_confirmation`, which `bookFromTemplate` never produces. A
  Mayor is asked only when a booking is over the venue's capacity.
- **A conflict after booking goes unnoticed.** For example a Mayor can block a
  day that is already booked, because `VenueSvc.addBlockedDate` checks for no
  bookings, and nobody is told.
- **A booked event cannot be edited.** No route changes a booked event's date,
  Mayor or Providers. 0003 covers only direct asset and service bookings.

## We propose

- **Only a matched Supplier is booked automatically.** An asset, service or venue
  row that is not `matched` starts at `pending_provider_confirmation`, the status
  extra Marketplace items already use, and the Supplier confirms or rejects it
  through `PATCH /event-transactions/:id/review`. A matched one keeps today's
  behaviour. *Consequence to accept:* `pending_provider_confirmation` blocks
  checkout (`event-checkout.service`) and the confirmation-deadline sweep rejects
  it after 24 hours, so a citizen booking an event with an unmatched Supplier
  cannot pay until that Supplier answers.
- **Decline is a new transition, not a reuse of `reject`.** Add a `decline` action
  for each kind from both `pending` and `approved`, with its own reason (not
  `provider_declined`, which means "rejected a request"), through
  `TransactionStatusSvc` only, so the authorization stays in one place. The
  Event Foxer and the citizen are notified.
- **A decline or conflict marks the event, it does not cancel it.** The item is
  flagged as needing a replacement, the Event Foxer is told which event and which
  Supplier, and nothing is refunded until the rules under "Open decisions" say so.
- **Conflict alerts are raised where the change is made.** Blocking a booked day
  (`VenueSvc.addBlockedDate`), pausing or removing a booked listing: each looks
  for booked events it would clash with and notifies the Event Foxer. Whether the
  change is then refused or allowed and flagged is decision 2 below.
- **An edit is a proposal, not a change.** The Event Foxer proposes swapping a
  Supplier (same category) or changing the date. The proposal is stored, not
  applied. It posts to the event's Shared Inbox thread (0005), and applies only
  once agreed. The inbox is for talking; the agreement itself is recorded on the
  proposal, never inferred from chat text.
- **Applying an edit re-checks and reprices from the server.** It runs
  `AvailabilitySvc.reserve` again for the new items and dates, and recomputes the
  price the way `bookFromTemplate` did (the Host Markup, the category fees and
  the processing fee, 0001 and 0009), never from a client figure. The Event
  already stores the rate it was booked at, so a repricing uses that stored rate,
  not the Event Foxer's current one.
- **The price difference is charged or refunded, not absorbed.** The same shape
  as 0003: a higher price needs the citizen to pay the difference before the
  change applies; a lower one refunds the difference; no change applies at once.

## Open decisions

These are the epic's, with the answer proposed here. They need the product
owner's decision before anything past item 1 is built.

1. **Until when can a matched Supplier decline?** *Proposed:* until the booking
   is paid. After payment only through the cancellation and refund policy, so a
   paid citizen is not left without a Supplier on a Supplier's whim.
2. **A declined or conflicting Supplier is never replaced.** *Proposed:* a fixed
   deadline (suggest 48 to 72 hours, to be set), after which the citizen can
   cancel with a **full** refund, as with a provider cancellation in 0003. For a
   conflict, *proposed:* allow the change but flag it, rather than refusing a
   Mayor's block, since a Mayor refused a day off is worse than an event that
   needs a swap.
3. **Can the Event Foxer edit when nothing has gone wrong?** *Proposed:* no. Only
   after a decline or a conflict, so an edit is always a repair.
4. **Who agrees to an edit?** *Proposed:* the citizen always, and a price
   increase needs their approval before it applies. A new Supplier is not
   booked automatically: it goes through `pending_provider_confirmation` like any
   unmatched Supplier.
5. **Swap candidates.** *Proposed:* the Event Foxer's matched Suppliers first. A
   Marketplace listing in the same category is allowed, but only once its owner
   confirms.

## To verify when building (not yet checked)

- How a replaced Supplier's reservation is freed. `AvailabilitySvc` exposes only
  `reserve`; the reservation appears to follow the transaction row's status, so a
  swap may only need the old row moved to a terminal status. Confirm before
  relying on it.
- How escrow and payouts treat a row that is declined or swapped after payment
  (0002 and 0006), so a Supplier is never paid for an item it declined.
- Whether `Booking.totalAmount` and the stored Event totals are the only places a
  repricing must update, and how that interacts with refunds already issued.
- The idempotency of a proposal's apply step: two agreements arriving together
  must apply once.

## Considered and rejected

- **Letting a Supplier decline only through cancellation.** Cancellation is the
  citizen's action and runs the citizen's policy; a Supplier who cannot deliver
  needs its own path, as 0003 gave direct bookings.
- **Letting the Event Foxer change a booked event without the citizen agreeing.**
  The citizen paid for a specific event and price; changing either unilaterally
  is the failure 0003 already rejected.
- **Applying the edit when the chat message is sent.** Chat is not an audit
  trail, and a message can be edited or misread; the proposal carries the
  agreement.
- **Cancelling the whole event when one Supplier declines.** Most declines are
  replaceable, and a cancellation refunds a citizen who may have wanted the
  event kept.
