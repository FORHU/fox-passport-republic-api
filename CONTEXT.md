# Fox Passport Republic

An event-booking marketplace. Citizens book Events (and the Assets/Services attached to them) that Hosts assemble out of inventory supplied by Mayors and Foxers.

## Language

**Citizen**:
A user with no approved RoleType yet (`roleType: []`). The default state for every signed-up user. Once a user is granted a RoleType, they hold that role *in addition to* being a citizen — RoleType is additive (an array), not a replacement of citizen status.
_Avoid_: Regular user, plain user

**RoleType**:
A supply-side capability a citizen can apply for and be approved to hold: `venueFoxer`, `eventFoxer`, `gearFoxer`, `serviceFoxer`, or `investor`. A user may hold more than one simultaneously. Distinct from `SystemRole` (`user`/`admin`), which governs platform administration, not marketplace participation.
_Avoid_: Role (ambiguous with SystemRole), permission

**Foxer**:
Umbrella term for a `gearFoxer` or `serviceFoxer` role-holder — anyone supplying inventory (Assets or Services) into the marketplace. Used when the distinction between the two doesn't matter.

**VenueFoxer**:
Role-holder who owns/operates Venues. VenueFoxers list Venues; they don't assemble Events. A Venue is bare space — unlike an Asset or Service, it isn't a sellable experience on its own, so (unlike GearFoxers/ServiceFoxers) VenueFoxers have no standalone booking path. A VenueFoxer only earns when an EventFoxer selects their Venue into an Event; this is intentional, not a gap.
_Avoid_: Mayor (old name)

**EventFoxer**:
Role-holder who assembles Events: an Event Template attaches an existing Venue (from a VenueFoxer) plus Assets/Services (from GearFoxers/ServiceFoxers), then spawns an Event Request for admin approval. An EventFoxer curates and organizes — they don't supply their own Venues, Assets, or Services. Also acts as the program manager for an event, coordinating all suppliers (decorations, catering, etc.) to deliver the full event experience.
_Avoid_: Host (old name)

**GearFoxer**:
Role-holder (`gearFoxer`) who supplies physical Assets (equipment, furniture, decorations, sound systems, etc.) into the marketplace for standalone booking or attachment to Event Templates.
_Avoid_: FoxerAsset (old name)

**ServiceFoxer**:
Role-holder (`serviceFoxer`) who supplies Services (catering, entertainment, design, staffing, etc.) into the marketplace for standalone booking or attachment to Event Templates.
_Avoid_: FoxerService (old name)

**Investor**:
Role-holder who provides funding rather than operational supply. Application requires proof of funds and an investment range, unlike the other RoleTypes.

**Host Markup**:
The percentage a Host adds on top of the sum of an Event Template's attached items (Venue/Assets/Services agreed prices) — this is how a Host earns. Set by the Host per template, not by the platform.
_Avoid_: Host fee, commission (implies platform-set, not Host-set)

**Platform Fee**:
The percentage the business itself takes on every transaction, added on top of what the citizen already sees (itemsTotal + Host Markup) — it's an extra line item, not carved out of any role's earnings. Distinct from Host Markup, which is Host-set and goes to the Host, not the business.

**Specialization**:
A category tag on a foxer's profile and listings showing what type of work they focus on. Comes in two forms with distinct visual treatment: a *Claimed* tag (declared at role-application time, admin-backed, capped at 3 per role) and an *Earned* badge (auto-granted by the system after 3 completed bookings in that category with a 4.0+ average rating, unlimited count, never revoked). Each role type uses its own category vocabulary: EventFoxer → EventCategory, ServiceFoxer → ServiceCategory, GearFoxer → AssetCategory, VenueFoxer → VenueCategory. Visible on both the foxer's public profile and on their listing cards.
_Avoid_: Specialty, skill tag, expertise
