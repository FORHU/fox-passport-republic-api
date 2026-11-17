// What a favourite can point at. Stored as `Favorite.entityType`; a "foxer"
// favourite's `entityId` is the Foxer's user id.
export const FAVORITE_TYPES = ["venue", "event", "foxer"] as const;

export type FavoriteType = (typeof FAVORITE_TYPES)[number];

export const isFavoriteType = (value: unknown): value is FavoriteType =>
  typeof value === "string" &&
  (FAVORITE_TYPES as readonly string[]).includes(value);

export const FAVORITE_INPUT_ERROR =
  "targetId and type ('venue' | 'event' | 'foxer') are required";

export const FOXER_NOT_FOUND = "Foxer not found";

export const FAVORITE_SELF = "You can't save yourself";
