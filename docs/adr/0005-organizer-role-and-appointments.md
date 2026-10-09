# Organizer is a vetted role that grants nothing on its own; power comes from Appointments

Mayors and Event Owners needed people to help run their Venues and Events. We made
**Organizer** a `RoleType` a citizen applies for and an admin approves — but unlike
every other RoleType, it grants no permissions by itself. It only makes a person
*eligible* to be **Appointed** by a Mayor or Event Owner to one specific Venue or
Event, and every permission comes from that Appointment. The vetting is global
(is this a trustworthy person?); the authority is local (over this one Venue or
Event), and neither alone is enough.

## Decisions

- **One Organizer role for both Venues and Events.** The vetting is the same; what
  differs is the Appointment's permission set.
- **Fixed permission set per Appointment kind**, stored as a list on each
  Appointment (as `EventOrganizerAssignment.permissions` already is), so per-person
  choice can come later without a migration. Mayor/Event Owner keep payouts,
  pricing, delete/transfer, Appointments and refunds.
- **Invitation, then acceptance.** An Appointment grants nothing until the Organizer
  accepts; invitations expire after 14 days; either side can end it.
- **Or a request, then acceptance** (added 24 Sep). Where the Mayor or Event
  Owner has switched requests on, an approved Organizer may ask to join; it
  grants nothing until the owner accepts. Off by default, at most 5 open per
  Organizer, same 14-day expiry. Owners can also search approved Organizers
  by name, city or specialization instead of needing an email; the search
  never returns one.
- **Check-in Helpers stay as a separate, unvetted tier** — added by email with no
  role, check-in only, on Events and Venues. Door work needs speed, not KYC.
- **Venue staff may check in guests of any Event held at their Venue, on its date
  only** — choosing the Venue is taken as the Event Owner's consent.
- **Losing the Organizer role ends every active Appointment immediately.** History
  and XP stay; nothing is restored on re-approval.
- **Event Appointments end 7 days after the Event** (immediately if cancelled);
  Venue Appointments are open-ended.
- **No platform pay.** Organizers get no `payouts:onboard`; Mayors and Event Owners
  pay them privately.
- **Affiliation requests with an `agreedPrice` stay Mayor-only**, since that is a
  price decision.
- **Accepting a bid stays the Event Owner's.** It sets the agreed price to the
  supplier's proposal. Organizers may see and reject bids.
- **Declining a client's request stays the Event Owner's.** It refunds the
  client automatically. Organizers may accept one.

## Settled after the first build (25 Sep 2026)

Two capabilities first agreed for Event Organizers, then set aside on 24 Sep
because nothing existed for them to act on, were decided for good:

- **Editing an Event's details and schedule stays the Event Owner's.**
  Organizers never get it, even once an endpoint for it exists.
- **Organizers talk to Suppliers instead of reporting them.** Rather than an
  Organizer opening a dispute over a supplier problem on the day, they message
  the Event's Suppliers — its booked Venue, Talent and Gear, and anyone bidding
  on it — through the Event's Shared Inbox (`event:message-suppliers`). A
  thread records whether it is with a guest or a Supplier, and that decides
  which permission reads it. Talking only: prices and accepting bids stay the
  Event Owner's.

## Considered Options

- **Anyone can be appointed; the role only makes you discoverable.** Rejected —
  unvetted people would see guest lists and sales.
- **Two roles, Event Organizer and Venue Organizer.** Rejected — doubles the
  application, review and tab work for no difference in vetting.
- **Rename `Event.organizerId` → `ownerId` and `Venue.mayorId` → `ownerId`.**
  Rejected for now. `mayorId` doesn't clash with anything. `organizerId` does
  clash in *name* with appointed Organizers, but the fix is cheaper than a
  ~25-file migration touching payouts: all checks go through `isEventOwner()` /
  `isEventOrganizer()`, never a raw `organizerId` comparison, and a test with an
  appointed Organizer pins it. Revisit if the name keeps misleading people.

## Consequences

- `organizer` joins `RoleType` and `UserPath`; `ROLE_TYPE_GRANTS.organizer` is
  deliberately `[]`. That empty entry is the design, not a gap.
- Conversations with guests move to a per-Venue / per-Event **Shared Inbox** so
  they survive an Organizer leaving — the largest piece of the work.
