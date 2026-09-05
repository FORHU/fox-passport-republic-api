/**
 * Total pages for `total` items at `limit` per page. Always at least 1, so an
 * empty result set still reports one (empty) page rather than zero.
 */
export function totalPages(total: number, limit: number): number {
  return Math.max(1, Math.ceil(total / limit));
}
