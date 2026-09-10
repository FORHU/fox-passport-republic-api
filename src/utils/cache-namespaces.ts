import { versionedCache } from "./cache.util";

/**
 * Cache namespaces that more than one module has to reach.
 *
 * A namespace belongs here when more than one *file* has to reach it. That is
 * usually because the rows are written from outside the module that owns the
 * reads - but a service and its own repository count too, and for the same
 * underlying reason: a repository may not import its service, so a namespace
 * the reads and the writes share has to live somewhere both can import.
 *
 * The rule used to be stated as "written from outside the module", which sent
 * `follow` and `investment` to a `<module>.cache.ts` of their own. That was
 * worse for a reason unrelated to layering: `tools/validate-architecture.mjs`
 * classifies files by suffix, so a `.cache.ts` inside a module has no layer and
 * is skipped by the boundary scan entirely. Two files nobody was checking is a
 * poor trade for a narrower rule. Bookings are the first: `booking.service.ts` owns
 * every cached booking read, but a booking row is also written by the payment
 * webhook, the refund flow, the review flow and the match rejection - six
 * modules in all. Each of those has to retire the cache, and none of them can
 * import `BookingSvc` without weaving the services into a cycle.
 *
 * `utils` is importable from every layer and may import no business layer, so a
 * namespace declared here can be reached from a service, a controller or a
 * repository without inverting any dependency. That is the whole reason this
 * file exists rather than the constant living in the service that owns it.
 *
 * A namespace with no cross-module writers should stay a `const` in its own
 * service - see the admin queue keys, which are named in `admin.service.ts`
 * because nothing outside admin invalidates them.
 */
export const bookingCache = versionedCache("booking");

/**
 * Venues are the second, for the same reason and a shorter list of writers:
 * `venue.repository.ts` owns creation, editing and archiving, and
 * `admin.repository.ts` sets the status when a venue is approved or rejected.
 * An approval is exactly the write somebody is watching for - a mayor refreshing
 * to see whether their venue went live - so it cannot be left to a TTL, and
 * `AdminRepo` cannot import `VenueSvc` without a cycle.
 *
 * Versioned rather than named: the read keys carry a filter hash, a page, a
 * bounding box and a viewer id, none of which an approval knows.
 */
export const venueCache = versionedCache("venue");

/**
 * Users are the widest: five modules write a user row - `users`, `profile`,
 * `admin/role-assignment`, `stripe-connect` and `auth`.
 *
 * **One write is deliberately excluded.**
 * `AuthRepo.updateUserLoginStatus` runs on every single sign-in, and retiring
 * this namespace from there would mean the public foxer listings were thrown
 * away every time anybody logged in anywhere - a cache with a hit rate set by
 * how busy the site is, which is precisely backwards. It is safe to exclude
 * because of what it writes: `updatedAt`, and nothing else. No cached read here
 * shows that field.
 *
 * The rule this leaves is narrower than "every write invalidates", so it is
 * worth saying plainly: **a write that changes what a profile or a listing
 * displays must retire this namespace.** A write that only touches
 * authentication bookkeeping need not.
 */
export const userCache = versionedCache("user");

/**
 * Event templates, written by three modules: `event-template` itself (the
 * template and every asset, service and venue attached to it),
 * `admin.repository` (approval and rejection), and `match.service`, which
 * creates a template when a match produces one.
 *
 * The approval is the write that matters most here, for the same reason it does
 * for venues: an owner submits a template and sits on the page waiting for it to
 * turn approved. The attach/remove writes matter nearly as much - they change
 * the price the listing quotes, which is computed from the attached items.
 */
export const eventTemplateCache = versionedCache("event-template");

/**
 * Assets and services are the other two listing types, and they behave exactly
 * as venues do: the owner writes them, an admin approves them, and the browse
 * pages read them far more often than either. Separate namespaces rather than
 * one `listing` namespace, so approving a venue does not cool the asset
 * listings as well.
 */
export const assetCache = versionedCache("asset");
export const serviceCache = versionedCache("service");

/**
 * Follows, whose six reads - counts, followers, following, requests,
 * suggestions and the status badge - are all changed by any one of the three
 * writes on `FollowRepo`. Nothing outside the module writes a follow; this is
 * here for the service/repository split described above.
 */
export const followCache = versionedCache("follow");

/** One minute. The button changes state under the person who pressed it. */
export const FOLLOW_TTL = 60;

/** Investments. Here for the same service/repository reason as `follow`. */
export const investmentCache = versionedCache("investment");

/** Two minutes: written rarely, read on a browse page. */
export const INVESTMENT_TTL = 120;
