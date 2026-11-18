# An Event Foxer declines a booking they cannot attend

**Status: accepted (2026-11-18), with the proposed answers below.** The host
decline is built (api#402, mobile#469); checking the host's own calendar at
booking (decision 2's first half) is not built yet. It is the other half of
[0010](./0010-event-booking-supplier-decline-and-edits.md): 0010 covers a
*Supplier* (a Provider or Mayor) leaving a booked event; this covers the
*Event Foxer*, the host who owns the event, leaving a booking.

## Context

A citizen books an Event Foxer's event (`BookingSvc.bookFromTemplate`). The
Event Foxer, who is the event's host (`Event.organizerId`), may already be
committed to another event at the same time and cannot run this one.

Today, as far as the code shows:

- **The host cannot say no.** Nothing on a booked event lets the host leave
  it. The only exits are the citizen cancelling, or each Supplier declining
  under 0010.
- **Availability is checked for Suppliers, not the host.** `AvailabilitySvc`
  locks and checks venue, asset, service and Provider calendars at booking. We
  have not found a check of the host's own calendar. *Unverified*: confirm
  before relying on this.
- **A host's silence leaves a paying citizen waiting.** With no way to decline,
  a host who cannot attend can only ignore the booking or ask the citizen to
  cancel.

0010 gives a Supplier a way out with a reason. The Event Foxer has the same
need and a bigger effect: the event itself is gone, not one item of it.

## We propose

- **A host decline is its own action, not a cancel.** Cancel is the citizen's
  action and runs their policy (0003). Add `decline` for the host on the
  booking, through the same status-transition code so authorization stays in one
  place, with its own reason (`host_declined`) and an optional cause
  (`busy`, as 0010's Supplier decline now has, or `other`). The cause is a fixed
  set, never free text.
- **Until when:** until the booking is paid, the same line as 0010 decision 1.
  After payment the host leaves only through the cancellation and refund policy,
  so a paid citizen is not left without an event on the host's whim.
- **The citizen is told at once,** with the host's cause ("busy with another
  event" or not), and the booking ends rather than waiting.
- **Every booked Supplier is released.** Their items move to a terminal status,
  so their calendars open up (confirm that is all a release needs; 0010 lists
  the same check). Each Supplier is told the event is off.
- **Nothing is charged.** An unpaid booking has taken no money, so a decline
  before payment refunds nothing. This is why the cutoff above matters.
- **A host that is repeatedly busy is visible.** Record each host decline with
  its cause, so an admin can see a host who declines often. No penalty is
  proposed here.

## Decisions

Accepted as proposed.

1. **Is a host decline allowed at all once a citizen has booked?** *Proposed:*
   yes, before payment only. The alternative is no decline: the host must
   prevent clashes by blocking dates, with a decline only through an admin.
2. **Should we prevent the clash instead?** *Proposed:* both. Check the host's
   own calendar at booking (a clash refuses the booking, as a Supplier's does),
   and still allow a decline for the clash that appears afterwards, for example
   a second event booked a moment later.
3. **Does a repeated decline cost the host anything** (a rating, a warning, a
   suspension of new bookings)? *Proposed:* record it only, no penalty yet.
4. **After payment, what does the citizen get?** *Proposed:* the full refund of
   0003's provider-cancellation rule, since the host, not the citizen, cannot
   deliver.
5. **Can the host propose another date instead of declining?** *Proposed:*
   later, through the edit proposal in 0010, not here.

## To verify when building (not yet checked)

- Whether any host calendar exists or is checked at booking (see Context).
- How escrow and payouts treat a booking the host leaves after payment (0002,
  0006), so no Supplier is paid for an event that did not happen.
- How a released Supplier's reservation is freed (the same open point as 0010).
- Whether `Booking` and `Event` statuses already have a terminal state that fits
  a host decline, or one is needed.

## Considered and rejected

- **Treating a host decline as a citizen cancellation.** The citizen did not
  choose it, and cancellation runs the citizen's refund policy.
- **Letting the host decline after payment without a refund rule.** The citizen
  paid for a specific event; leaving it silently is the failure 0003 rejected.
- **Letting a host simply stop replying.** The citizen is left waiting, and
  nothing is recorded.
