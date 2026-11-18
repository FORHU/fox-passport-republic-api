---
domain: Fox Passport Republic
updated: 2026-08-27
---

# Fox Passport Republic

An event-booking marketplace. Citizens book Events (and the Assets/Services attached to them) that EventFoxers assemble out of inventory supplied by VenueFoxers and Providers.

This file mirrors the `RoleType` / `SystemRole` enums in `prisma/schema.prisma`.
**When they disagree, the schema wins** — it is the source of truth, and this file
is the source of truth for the app's copy at `fox-passport-republic-app/CONTEXT.md`.

## Language

**Citizen**:
A user with no approved RoleType yet (`roleType: []`). The default state for every signed-up user. Once a user is granted a RoleType, they hold that role _in addition to_ being a citizen — RoleType is additive (an array), not a replacement of citizen status.
_Avoid_: Regular user, plain user

**RoleType**:
A supply-side capability a citizen can apply for and be approved to hold: `venueFoxer`, `eventFoxer`, `providerFoxer`, `organizer` or `investor`. A user may hold more than one simultaneously. Distinct from `SystemRole` (`user`/`admin`), which governs platform administration, not marketplace participation.
_Avoid_: Role (ambiguous with SystemRole), permission

**Foxer**:
Umbrella term for a supply-side role-holder: a Provider, VenueFoxer or EventFoxer.

**Provider**:
Role-holder (`providerFoxer`) who supplies physical Assets (equipment, furniture, decorations, sound systems) and Services (catering, design, staffing, and performer categories such as photography, DJ, live band, MC) into the marketplace, for standalone booking or attachment to Event Templates. One role covers all three kinds of supply; performer categories still need `performer:manage` and the rest `service:manage`, and a Provider holds both. Replaced GearFoxer, ServiceFoxer (Talent Foxer) and PerformerFoxer, which were folded into it and removed on 9 Nov 2026 — see `docs/adr/0008-retire-legacy-supply-roles.md`.
_Avoid_: GearFoxer, ServiceFoxer, Talent Foxer, PerformerFoxer (retired roles)

**VenueFoxer**:
Role-holder who owns/operates Venues. VenueFoxers list Venues; they don't assemble Events. A Venue is bare space — unlike an Asset or Service, it isn't a sellable experience on its own, so (unlike Providers) VenueFoxers have no standalone booking path. A VenueFoxer only earns when an EventFoxer selects their Venue into an Event; this is intentional, not a gap.
_Avoid_: Owner (for a venue — see **Mayor**)

**EventFoxer**:
Role-holder who assembles Events: an Event Template attaches an existing Venue (from a VenueFoxer) plus Assets/Services (from Providers), then spawns an Event Request for admin approval. An EventFoxer curates and organizes — they don't supply their own Venues, Assets, or Services. Also acts as the program manager for an event, coordinating all suppliers (decorations, catering, etc.) to deliver the full event experience.
_Avoid_: Host (old name)

**Investor**:
Role-holder who provides funding rather than operational supply. Application requires proof of funds and an investment range, unlike the other RoleTypes.

**Organizer**:
A RoleType a citizen applies for and is admin-approved to hold, which makes them eligible to be **Appointed** to help run a specific Event or Venue. Holding the role alone grants nothing over any Event or Venue — only an Appointment does.
_Avoid_: Delegate, staff, co-host

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
