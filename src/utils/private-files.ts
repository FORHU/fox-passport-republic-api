import { getPrivateObjectUrl } from "./s3";

/**
 * Fills in a short-lived link for every private File record in a response.
 *
 * Private documents are stored with an empty `url` and a `storageKey` (see
 * File in platform.prisma). Walks plain objects and arrays — whatever Prisma
 * returned — and for each record with `isPrivate: true` swaps in a presigned
 * link that expires in minutes, dropping the key itself from the output.
 *
 * Call it only on responses for someone allowed to see those documents (an
 * admin reviewing an application): the links work for whoever holds them.
 * Public files pass through untouched.
 */
export async function signPrivateFiles<T>(value: T): Promise<T> {
  const pending: Promise<void>[] = [];
  const seen = new WeakSet<object>();

  const visit = (node: unknown) => {
    if (!node || typeof node !== "object" || node instanceof Date) return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const record = node as Record<string, unknown>;
    if (record.isPrivate === true && typeof record.storageKey === "string") {
      const key = record.storageKey;
      delete record.storageKey;
      pending.push(
        getPrivateObjectUrl(key).then((url) => {
          record.url = url;
        }),
      );
      return;
    }
    Object.values(record).forEach(visit);
  };

  visit(value);
  await Promise.all(pending);
  return value;
}
