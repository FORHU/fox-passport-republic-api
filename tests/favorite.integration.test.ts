import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/utils/prisma";
import FavoriteSvc from "../src/modules/favorite/favorite.service";

/**
 * Epic api#454 against the real database: any number of favourites, one row
 * per item however many adds race, and a favourite only its owner can delete.
 */

describe("Favorites", () => {
  const runId = Math.random().toString(36).substring(7);
  const ids: Record<string, string> = {};
  const foxers: string[] = [];

  beforeAll(async () => {
    for (const key of ["owner", "other"]) {
      const u = await prisma.user.create({
        data: {
          email: `fav_${key}_${runId}@test.com`,
          username: `fav_${key}_${runId}`,
          password: "pw",
          roleType: [],
          name: `Fav ${key}`,
        },
      });
      ids[key] = u.id;
    }
    for (let i = 0; i < 5; i++) {
      const u = await prisma.user.create({
        data: {
          email: `fav_fox${i}_${runId}@test.com`,
          username: `fav_fox${i}_${runId}`,
          password: "pw",
          roleType: [],
          name: `Foxer ${i}`,
        },
      });
      foxers.push(u.id);
    }
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [...Object.values(ids), ...foxers] } },
    });
  });

  it("keeps more than three favourites (app#416)", async () => {
    for (const id of foxers) {
      await FavoriteSvc.addFavorite(ids.owner, id, "foxer");
    }

    const list = await FavoriteSvc.getUserFavorites(ids.owner);
    expect(list).toHaveLength(5);
    expect(new Set(list.map((f) => f.targetId))).toEqual(new Set(foxers));
  });

  it("stores one row however many adds race (api#455)", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        FavoriteSvc.addFavorite(ids.other, foxers[0], "foxer"),
      ),
    );

    expect(results.every((r) => r.added)).toBe(true);
    const rows = await prisma.favorite.count({
      where: { userId: ids.other, entityId: foxers[0], entityType: "foxer" },
    });
    expect(rows).toBe(1);
  });

  it("returns the saved card with the add (app#415)", async () => {
    const { favorite } = await FavoriteSvc.addFavorite(
      ids.other,
      foxers[1],
      "foxer",
    );
    expect(favorite).toMatchObject({
      targetId: foxers[1],
      type: "foxer",
      foxer: { id: foxers[1], name: "Foxer 1" },
    });
  });

  it("lets only the owner delete a favourite by id", async () => {
    const mine = await prisma.favorite.findFirstOrThrow({
      where: { userId: ids.owner, entityId: foxers[2] },
    });

    await expect(
      FavoriteSvc.removeFavorite(mine.id, ids.other),
    ).rejects.toMatchObject({ status: 404 });
    expect(await prisma.favorite.count({ where: { id: mine.id } })).toBe(1);

    await FavoriteSvc.removeFavorite(mine.id, ids.owner);
    expect(await prisma.favorite.count({ where: { id: mine.id } })).toBe(0);
  });
});
