# An Event nobody checked in to is flagged for review, never settled automatically

An Event's status follows its bookings (`EventRequestSvc.syncStatusFromBookings`),
and a booking settles at check-in. An Event that ended with bookings but no
check-in therefore had nothing to move it: it stayed `pending` forever, with
paid bookings still `confirmed`, providers unpaid and no completion XP. A
machine cannot tell "the guests came and nobody scanned them" from "nobody
came", and each answer moves money differently, so we decided a person settles
it, one booking at a time. Decided 27 Oct 2026; built in #205 (API) and #184
(app).

## Decisions

- **The daily job only flags.** At 01:00 it flags an Event that has ended,
  still has a booking that isn't cancelled, has no check-in, and is neither
  completed nor cancelled. It changes no Event or booking status and triggers
  no XP, payouts or refunds.
- **Flagged once.** `Event.reviewFlaggedAt` is claimed with one conditional
  write, so the API instances that all run the job flag each Event once. Only
  the winner notifies the Event Foxer.
- **An admin settles each booking, not the Event.** The Event's status then
  follows its bookings under the existing rules, so an Event with any booking
  still open stays in review.
- **Attended goes through check-in's own follow-up**: payouts, the guest's
  Stamp, venue XP and the Event's status. Only a paid booking can be marked
  attended. The Organizer check-in XP is not awarded, since no Organizer
  checked anyone in.
- **A no-show is cancelled with no refund, and the money stays put.** The
  event has started, so every cancellation policy already refunds nothing.
  Payments stay `paid`, no refund row is written and providers are not paid
  for it. What happens to that money is a manual admin decision through the
  existing refund and payout tools. An unpaid booking may also be closed as a
  no-show.
- **Each outcome runs once.** It is a conditional claim on a booking still
  open; a second click or a second admin gets 409 and runs nothing.
- Both outcomes are recorded on the package's History, with the admin as the
  actor.

## Considered Options

- **Mark the Event completed automatically.** Rejected: it pays providers and
  awards XP with no evidence anyone attended.
- **Mark it cancelled automatically.** Rejected: paid guests would expect
  refunds, and providers who delivered would go unpaid.
- **One settle button for the whole Event.** Rejected: guests at one Event can
  differ, and the Event's status already derives from its bookings.
- **A no-show settles as completed, paying providers.** Rejected for now: the
  money is held rather than released without attendance.

## Consequences

- A Stamp still needs a booking that reached `completed` (CONTEXT.md, Stamp),
  so a no-show earns none.
- Flagged Events wait on an admin; until the **Needs review** tab is worked,
  their providers are unpaid. Nothing chases the queue yet.
- Held no-show money is not tracked anywhere separately. If that needs
  reporting, it is a query on cancelled bookings with paid payments.
