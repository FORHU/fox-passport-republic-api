import { versionedCache } from "./cache.util";

/**
 * Cache namespaces that more than one module has to reach.
 *
 * A namespace belongs here when the rows it covers are written from outside the
 * module that owns the reads. Bookings are the first: `booking.service.ts` owns
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
