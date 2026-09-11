import SearchRepo from "./search.repository";
import { cached, fingerprint } from "../../utils/cache.util";

export default class SearchSvc {
  /**
   * **TTL only, and it has to be.** This searches across assets, services and
   * venues at once, so the writes that change its answer live in three separate
   * namespaces. Putting it in any one of them would be worse than a TTL, not
   * better: it would look invalidated while still going stale from the other
   * two.
   *
   * Sixty seconds, because a search result that is a minute old is ordinary and
   * the query is broad enough to be worth not repeating for every visitor
   * typing the same city.
   */
  static async searchByLocation(
    location?: string,
    category?: string,
    page = 1,
    limit = 30,
  ) {
    return cached(
      `search:byLocation:${fingerprint({ location, category, page, limit })}`,
      60,
      () => SearchRepo.searchByLocation(location, category, page, limit),
    );
  }
}
