---
domain: Fox Passport Republic
updated: 2026-11-26
---

# Fox Passport Republic

An event-booking marketplace. Citizens book Events (and the Assets/Services attached to them) that EventFoxers assemble out of inventory supplied by VenueFoxers and Providers.

This file mirrors the `RoleType` / `SystemRole` enums in `prisma/schema/`.
**When they disagree, the schema wins** — it is the source of truth, and this file
is the source of truth for the app's copy at `fox-passport-republic-app/CONTEXT.md`.

## Language

**Citizen**:
A user with no approved RoleType yet (`roleType: []`). The default state for every signed-up user. Once a user is granted a RoleType, they hold that role _in addition to_ being a citizen — RoleType is additive (an array), not a replacement of citizen status.
_Avoid_: Regular user, plain user

**RoleType**:
A supply-side capability a citizen can apply for and be approved to hold: `venueFoxer`, `eventFoxer`, `providerFoxer`, `organizer` or `investor`. A user may hold more than one simultaneously. People see them as Venue Foxer, Event Foxer, Provider Foxer, Event Coordinator (`organizer`, shown under Provider Foxer) and Partner Foxer (`investor`, hidden from role selection since 23 Nov 2026). Distinct from `SystemRole`, which governs platform administration, not marketplace participation.
_Avoid_: Role (ambiguous with SystemRole), permission

**SystemRole**:
Platform administration: `user` (everyone), `admin_secretary` (reviews the approval queues and moderates content, nothing else), and `admin` (everything: users and roles, categories, policies, fees, payments, refunds, disputes, promotions, rewards settings). Grants are in `src/types/permissions.ts`.
_Avoid_: Role (for this)

**Foxer**:
Umbrella term for a supply-side role-holder: a Provider, VenueFoxer or EventFoxer.

**Provider**:
Role-holder (`providerFoxer`) who supplies physical Assets (equipment, furniture, decorations, sound systems) and Services (catering, design, staffing, and performer categories such as photography, DJ, live band, MC) into the marketplace, for standalone booking or attachment to Event Templates. One role covers all three kinds of supply; performer categories still need `performer:manage` and the rest `service:manage`, and a Provider holds both. A Provider has at least one specialty (sub-category) and may have many, and is booked for one thing at a time. Fulfilling a service (photography, DJ, catering) never makes a Provider the **Event Owner**. Replaced GearFoxer, ServiceFoxer (Talent Foxer) and PerformerFoxer, which were folded into it and removed on 9 Nov 2026 — see `docs/adr/0008-retire-legacy-supply-roles.md`.
_Avoid_: GearFoxer, ServiceFoxer, Talent Foxer, PerformerFoxer (retired roles)

**VenueFoxer**:
Role-holder who owns/operates Venues. VenueFoxers list Venues; they don't assemble Events. A Venue is bare space — unlike an Asset or Service, it isn't a sellable experience on its own. A VenueFoxer earns when an EventFoxer selects their Venue into an Event, or through a **direct venue booking**: a Citizen books the Venue itself from its page (`BookingSvc.createBooking` with a `venueId` and no package). Direct venue bookings are live and approved to stay (26 Nov 2026); any change to that flow is reviewed first.
_Avoid_: Owner (for a venue — see **Mayor**)

**EventFoxer**:
Role-holder who assembles Events: an Event Template attaches an existing Venue (from a VenueFoxer) plus Assets/Services (from Providers), then spawns an Event Request for admin approval. An EventFoxer curates and organizes — they don't supply their own Venues, Assets, or Services. Also acts as the program manager for an event, coordinating all suppliers (decorations, catering, etc.) to deliver the full event experience.
_Avoid_: Host (old name)

**Investor**:
Role-holder who provides funding rather than operational supply. Application requires proof of funds and an investment range, unlike the other RoleTypes.

**Event Coordinator** (`organizer`):
A role a citizen applies for and is admin-approved to hold, which makes them eligible to be **Appointed** to help run a specific Event or Venue. Holding the role alone grants nothing over any Event or Venue — only an Appointment does. Shown to people as **Event Coordinator** under Provider Foxer. In code it is still its own `organizer` RoleType. Approved on 26 Nov 2026, not built yet: Event Coordinator becomes a **specialty** of a Provider Foxer; existing Event Coordinators are migrated to Provider Foxers with that specialty, keeping their accounts, appointments and history. Not every Provider gets the specialty.
_Avoid_: Organizer (in the UI), delegate, staff, co-host

**Partner Foxer** (`investor`):
Internal role for funding: equipment inventory hubs, venue equity, event sponsorships (`PartnerInvestment`, `PartnershipProposal`). Hidden from role selection; its data and API remain.

**Venue**:
A commercial event location listed by a VenueFoxer (its **Mayor**), with a price, availability and bookings through Events. Status: `draft` → `pending` → `available` once an admin approves; `rejected`; `archived` instead of deleted.

**Event venue rule**:
Every Event has a Venue (epic #477, built). A package can't be sent for review, published or booked without one that is taking bookings (`409 VENUE_REQUIRED`); the venue line is never optional. A Venue used by a package line or a stamp can't be deleted, and an account owning one can't be deleted (`409 VENUE_IN_USE`). Approved on 26 Nov 2026, not built yet: an Event has exactly one location, a **Venue or a Place**.

**Place** (decided, not built):
A non-commercial event location: a home, a garden, a park. Stores a name, full address, city, province or state, country, map pin, optional notes and its creator; saved to the Citizen or Provider Foxer who created it, private by default and reusable. No price (₱0), no Mayor, no bookings of its own. Others see only its name and city; the full address goes only to confirmed participants, the Event Coordinator, assigned Suppliers who need it, and admins, enforced by the API. After a booking is confirmed its location changes are recorded and guests are notified. Design pending review: library `requirements/places-match-requests-stamps.md`.

**Passport Stamp**:
A system-generated record of a Citizen's attended experience. Today: one per attended booking (`bookingId` unique), naming its Venue when there is one. Approved, not built: a stamp names a Venue or a Place (exactly one), shows only the name, city, date, event and location type (never a street address), is issued only after a verified check-in (an admin's financial review does not stamp), is one per Citizen per Event, and is never issued for cancelled, refunded, disputed or seeded/test activity.

**Match Request**:
A Citizen asking a Foxer directly from the Foxer's match page (`POST /matches`). Today it creates an Event and a pending Booking in one step, charges at once when the total is above ₱0, and the Foxer accepts or declines (a decline refunds); accepting needs a venue on the request. Decided, not built: every match request has a Venue (from a package, or picked by the Citizen) or a Place; a Mayor who isn't a partner has 72 hours to accept and the Citizen pays only after; an "Own idea" request gets an itemized **quotation** (services, prices, fees, conditions, expiry) from the Foxer receiving it, and the Citizen pays only after accepting it. A Citizen describes their idea but never builds a Provider package. When a Citizen asks for services at their own Place, the Citizen is the Event Owner and each Provider is a supplier.

**Seeded data**:
Records the seeders create for demos and tests. They never count as real bookings, attendance, stamps, Tokens, achievements, milestones, leaderboards or analytics, and are never deleted blindly. Today they're recognisable by a `seed-` id prefix (venues, packages, events, bookings, stamps) and, for users, by email domain; an explicit seed marker is approved, not built.

**Mayor**:
The VenueFoxer a Venue belongs to — exactly one per Venue. The only one who can make or revoke Appointments on that Venue, and the only one who sets its prices.
_Avoid_: Owner, venue owner

**Event Owner**:
The EventFoxer who created an Event — exactly one per Event. The only one who can make or revoke Appointments on that Event, and the only one who controls its pricing and payouts. Stored in code as `Event.organizerId`, a legacy name: the Event Owner is not an Organizer by Appointment.
_Avoid_: Host, organizer (for the Event Owner) — an Event has one Event Owner and any number of Organizers

**Appointment**:
A Mayor or Event Owner naming an approved Organizer to help run one of their own Venues or Events. They may make any number of Appointments per Event or Venue. It starts from either side (the Mayor or Event Owner invites, or an Organizer requests to join one that accepts requests) and takes effect only once the other side accepts. Either side can end it at any time. The Mayor or Event Owner is always an Organizer of what they own, without applying and without an Appointment.
_Avoid_: Assignment, delegation

**Check-in Helper**:
Any user a Mayor or Event Owner adds to an Event or Venue solely to check guests in. Needs no RoleType and no admin approval — the lightweight tier beneath Organizer. Every Organizer can also check guests in, so an Organizer is never also added as a Check-in Helper.
_Avoid_: Door staff, delegate, check-in delegate

**Shared Inbox**:
The one conversation space an Event or Venue has with guests — and, for an Event, with its Suppliers. Every conversation belongs to the Event or Venue, not to whoever replied; its Mayor or Event Owner and every current Organizer read and answer it, and each reply shows who sent it.
_Avoid_: Organizer inbox, personal thread (for these conversations)

**Supplier**:
Anyone an Event depends on to happen: the Mayor of its booked Venue, and the Foxers booked to supply its Talent or Gear, or bidding to. An Event's Organizers talk to its Suppliers through its Shared Inbox, but only the Event Owner agrees prices with them.
_Avoid_: Vendor, provider (in conversation; `providerId` in code)

**Host Markup** (Commission):
How an EventFoxer earns on an Event. One percentage per EventFoxer, which they set for all their Events, charged on each Foxer's price and paid to the EventFoxer after the Event. An Event keeps the rate it was created with. In code it's `commissionPct`/`commissionAmount`, and the Event's total is still stored as `hostMarkupAmount`. Older Events used a markup per template instead (ADR 0001, replaced by ADR 0009). "Commission" was on the avoid list before #264; it is now the preferred word for this rate in conversation and in the UI.
_Avoid_: Host fee

**Platform Fee** (FoxPassport fee):
The percentage FoxPassport itself takes. On an Event, the admin sets it per category (`event_item` fee rules), and it's charged on each Foxer's price only, never on the commission. It is added on top of the price as its own line, not carved out of anyone's earnings, and never paid out. Distinct from the **Processing Fee**.

**Processing Fee**:
A percentage added to each Event line to cover card-processing costs: `PROCESSING_FEE_PERCENT`, 3% by default, charged on the Foxer's price only. Like the **Platform Fee**, it is shown to the client as its own line and never paid out to anyone.
_Avoid_: Stripe fee, card fee, service charge

**Specialization**:
A category tag on a foxer's profile and listings showing what type of work they focus on. Comes in two forms with distinct visual treatment: a _Claimed_ tag (declared at role-application time, admin-backed, capped at 3 per role) and an _Earned_ badge (auto-granted by the system after 3 completed bookings in that category with a 4.0+ average rating, unlimited count, never revoked). Each role type uses its own category vocabulary: EventFoxer → EventCategory, Provider → ServiceCategory and AssetCategory (performer categories are split by value, not a separate enum — see `PERFORMER_SERVICE_CATEGORIES` in `src/types/permissions.ts`), VenueFoxer → VenueCategory. Visible on both the foxer's public profile and on their listing cards.
_Avoid_: Specialty, skill tag, expertise
