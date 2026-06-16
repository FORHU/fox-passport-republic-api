# Fox Passport Republic

An event-booking marketplace. Citizens book Events (and the Assets/Services attached to them) that Hosts assemble out of inventory supplied by Mayors and Foxers.

## Language

**Citizen**:
A user with no approved RoleType yet (`roleType: []`). The default state for every signed-up user. Once a user is granted a RoleType, they hold that role *in addition to* being a citizen — RoleType is additive (an array), not a replacement of citizen status.
_Avoid_: Regular user, plain user

**RoleType**:
A supply-side capability a citizen can apply for and be approved to hold: `mayor`, `host`, `foxerAsset`, `foxerService`, or `investor`. A user may hold more than one simultaneously. Distinct from `SystemRole` (`user`/`admin`), which governs platform administration, not marketplace participation.
_Avoid_: Role (ambiguous with SystemRole), permission

**Foxer**:
Umbrella term for a `foxerAsset` or `foxerService` role-holder — anyone supplying inventory (Assets or Services) into the marketplace. Used when the distinction between the two doesn't matter.

**Mayor**:
Role-holder who owns/operates Venues. Mayors list Venues; they don't assemble Events. A Venue is bare space — unlike an Asset or Service, it isn't a sellable experience on its own, so (unlike Foxers) Mayors have no standalone booking path. A Mayor only earns when a Host selects their Venue into an Event; this is intentional, not a gap.

**Host**:
Role-holder who assembles Events: an Event Template attaches an existing Venue (from a Mayor) plus Assets/Services (from Foxers), then spawns an Event Request for admin approval. A Host curates and organizes — they don't supply their own Venues, Assets, or Services.

**Investor**:
Role-holder who provides funding rather than operational supply. Application requires proof of funds and an investment range, unlike the other RoleTypes.

**Host Markup**:
The percentage a Host adds on top of the sum of an Event Template's attached items (Venue/Assets/Services agreed prices) — this is how a Host earns. Set by the Host per template, not by the platform.
_Avoid_: Host fee, commission (implies platform-set, not Host-set)

**Platform Fee**:
The percentage the business itself takes on every transaction, added on top of what the citizen already sees (itemsTotal + Host Markup) — it's an extra line item, not carved out of any role's earnings. Distinct from Host Markup, which is Host-set and goes to the Host, not the business.
