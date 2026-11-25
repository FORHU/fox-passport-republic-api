# Suppliers declining a booked event, and Event Foxers editing it

**Status: accepted (2026-11-18), with the proposed answers below.** Built so
far: the Supplier decline with a "busy" cause and conflict alerts with a
booked-event read (api#397, #399, #401); swapping a Supplier on an unpaid
booking (api#406); the replacement deadline and full refund (decision 2, set
to 48 hours on 2026-11-19); auto-booking only matched Suppliers, behind
`AUTO_BOOK_MATCHED_ONLY` (off until the web booking flow handles the wait);
swapping a Supplier on a paid booking, with the difference paid before it
applies or refunded at once (slice 3); moving the event to another date
(decision 6, added 2026-11-25 for the web sub-issue app#318). Epic:
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

## Decisions

These are the epic's, accepted as proposed.

1. **Until when can a matched Supplier decline?** *Proposed:* until the booking
   is paid. After payment only through the cancellation and refund policy, so a
   paid citizen is not left without a Supplier on a Supplier's whim.
2. **A declined or conflicting Supplier is never replaced.** *Proposed:* a fixed
   deadline (suggest 48 to 72 hours, to be set), after which the citizen can
   cancel with a **full** refund, as with a provider cancellation in 0003.
   *Set (2026-11-19):* 48 hours from when the line started needing a
   replacement (its `attentionSince`: the decline, the rejection or lapse of a
   replacement, the blocked day, or the listing taken down), but never later
   than 24 hours before the event; a dropout inside that last day opens the
   full-refund cancel at once. A replacement accepted in time closes it. For a
   conflict, *proposed:* allow the change but flag it, rather than refusing a
   Mayor's block, since a Mayor refused a day off is worse than an event that
   needs a swap.
3. **Can the Event Foxer edit when nothing has gone wrong?** *Proposed:* no. Only
   after a decline or a conflict, so an edit is always a repair. *Amended
   (2026-11-25):* this holds for **swapping a Supplier**, the edit that drops a
   Supplier who did nothing wrong. A **date change** may be proposed any time
   the booking can still change (decision 6): the citizen agrees to it, the
   Suppliers re-confirm, and [0011](./0011-event-foxer-declines-a-booking.md)
   decision 5 already sends "the host proposes another date" here.
4. **Who agrees to an edit?** *Proposed:* the citizen always, and a price
   increase needs their approval before it applies. A new Supplier is not
   booked automatically: it goes through `pending_provider_confirmation` like any
   unmatched Supplier.
5. **Swap candidates.** *Proposed:* the Event Foxer's matched Suppliers first. A
   Marketplace listing in the same category is allowed, but only once its owner
   confirms.

6. **Moving the event to another date** (added 2026-11-25). A proposal of
   `type: reschedule` (`POST /event-transactions/event/:eventId/reschedule`,
   after `GET .../reschedule-preview?startAt=`), for the event's host only:
   - **When:** a package (template) event whose one booking is `pending` or
     `confirmed`, with both the current and the new start at least 48 hours
     away. One open proposal per booking, swap or reschedule
     (`PROPOSAL_PENDING`).
   - **What moves:** the start; the event keeps its length. The event's and
     the booking's dates move together, and the booking's reminder is due
     again.
   - **Every Supplier must be free then,** or the proposal is refused
     (`AVAILABILITY_CONFLICT`, naming them): a change never half-applies.
     A line whose listing was paused or removed, or that was declined, is
     left out: it is replaced first, on whichever date the event ends up on.
     A venue blocked on the current date is checked on the new one, which may
     well be free.
   - **On acceptance** availability is checked again under lock, the event's
     date and price must be what was proposed (`PROPOSAL_STALE`,
     `PROPOSAL_PRICE_CHANGED`), and the proposal is claimed first so two
     answers apply once. A partner (decision 5) stays booked; every other
     Supplier moves to `pending_provider_confirmation` with 24 hours to confirm
     the new date, and one that rejects or lapses needs replacing under
     decision 2.
   - **Price:** agreed prices don't depend on the date, so the total stays the
     same and nothing is charged or refunded. A reschedule runs through the
     same accept path as a swap, so a future date-based price would settle
     the same way.
   - `GET /event-transactions/proposals` lists date changes only with
     `?include=reschedule`, so an app that knows only swaps never shows one
     as an empty swap.

## To verify when building

- ~~How a replaced Supplier's reservation is freed.~~ *Checked (2026-11-25):*
  a reservation is the transaction row itself. `AvailabilitySvc` counts rows in
  `RESERVING_TRANSACTION_STATUSES` whose event overlaps the dates, so a row
  moved to a terminal status frees its slot, and moving the event's dates
  moves every one of its reservations.
- ~~The idempotency of a proposal's apply step.~~ *Checked:* both a swap and a
  reschedule claim the proposal (`updateMany` from `pending`) inside the
  transaction that applies it, so a second answer finds nothing to claim.
- How escrow and payouts treat a row that is declined or swapped after payment
  (0002 and 0006), so a Supplier is never paid for an item it declined.
- Whether `Booking.totalAmount` and the stored Event totals are the only places a
  repricing must update, and how that interacts with refunds already issued.

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
