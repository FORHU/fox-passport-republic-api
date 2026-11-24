import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * app#313: saving a Foxer. Adding is idempotent (it used to reuse toggle, so a
 * second add removed the favourite), an id that is no user is refused, and the
 * list joins each Foxer's public card fields. Prisma is stubbed.
 */

const prisma = vi.hoisted(() => ({
  favorite: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(async () => ({})),
    delete: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  user: { findUnique: vi.fn(), findMany: vi.fn(async () => []) },
  venue: { findMany: vi.fn(async () => []) },
  eventTemplate: { findMany: vi.fn(async () => []) },
}));
vi.mock("../src/utils/prisma", () => ({ prisma }));

const { default: FavoriteRepo } =
  await import("../src/modules/favorite/favorite.repository");
const { default: FavoriteSvc } =
  await import("../src/modules/favorite/favorite.service");

beforeEach(() => vi.clearAllMocks());

describe("FavoriteSvc.addFavorite", () => {
  const createdAt = new Date("2026-11-24T00:00:00Z");
  const row = (entityId: string, entityType: string) => ({
    id: "fav-1",
    userId: "u-1",
    entityId,
    entityType,
    createdAt,
  });

  // api#455: an upsert on the (user, type, item) key, so a double click or two
  // devices saving at once leave one row; the unique index backs it.
  it("upserts the favourite on its (user, type, item) key", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "fox-1" });
    prisma.favorite.upsert.mockResolvedValue(row("fox-1", "foxer"));

    await FavoriteSvc.addFavorite("u-1", "fox-1", "foxer");

    const key = { userId: "u-1", entityId: "fox-1", entityType: "foxer" };
    expect(prisma.favorite.upsert).toHaveBeenCalledWith({
      where: { userId_entityType_entityId: key },
      create: key,
      update: {},
    });
    expect(prisma.favorite.create).not.toHaveBeenCalled();
    expect(prisma.favorite.delete).not.toHaveBeenCalled();
  });

  // app#415: the saved card can be shown at once, name and image included.
  it("returns the saved favourite with its card data", async () => {
    prisma.favorite.upsert.mockResolvedValue(row("v-1", "venue"));
    prisma.venue.findMany.mockResolvedValue([
      {
        id: "v-1",
        name: "Rooftop",
        city: "Makati",
        state: "Metro Manila",
        price: 500,
        billingRate: "hourly",
        images: [{ imageUrl: "https://cdn/rooftop.jpg" }],
      },
    ] as never);

    await expect(
      FavoriteSvc.addFavorite("u-1", "v-1", "venue"),
    ).resolves.toEqual({
      added: true,
      favorite: {
        id: "fav-1",
        targetId: "v-1",
        type: "venue",
        createdAt,
        venue: {
          id: "v-1",
          name: "Rooftop",
          city: "Makati",
          state: "Metro Manila",
          price: 500,
          billingRate: "hourly",
          images: [{ imageUrl: "https://cdn/rooftop.jpg" }],
        },
      },
    });
  });

  it("refuses a Foxer id that is no user", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      FavoriteSvc.addFavorite("u-1", "nobody", "foxer"),
    ).rejects.toThrow("Foxer not found");
    expect(prisma.favorite.upsert).not.toHaveBeenCalled();
  });

  it("refuses saving yourself as a Foxer", async () => {
    await expect(
      FavoriteSvc.addFavorite("u-1", "u-1", "foxer"),
    ).rejects.toThrow("You can't save yourself");
    expect(prisma.favorite.upsert).not.toHaveBeenCalled();
  });

  it("doesn't look up a user for a venue", async () => {
    prisma.favorite.upsert.mockResolvedValue(row("v-1", "venue"));

    await FavoriteSvc.addFavorite("u-1", "v-1", "venue");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.favorite.upsert).toHaveBeenCalled();
  });
});

describe("FavoriteSvc.removeFavorite", () => {
  // It used to delete any id, so one user could remove another's favourite.
  it("deletes only the caller's own favourite", async () => {
    prisma.favorite.deleteMany.mockResolvedValue({ count: 1 });

    await FavoriteSvc.removeFavorite("fav-1", "u-1");

    expect(prisma.favorite.deleteMany).toHaveBeenCalledWith({
      where: { id: "fav-1", userId: "u-1" },
    });
    expect(prisma.favorite.delete).not.toHaveBeenCalled();
  });

  it("answers not found for someone else's id", async () => {
    prisma.favorite.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      FavoriteSvc.removeFavorite("fav-of-another", "u-1"),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("FavoriteRepo.getUserFavorites", () => {
  it("joins each saved Foxer's public fields", async () => {
    const createdAt = new Date("2026-11-17T00:00:00Z");
    prisma.favorite.findMany.mockResolvedValue([
      { id: "f-1", entityId: "fox-1", entityType: "foxer", createdAt },
      { id: "f-2", entityId: "gone", entityType: "foxer", createdAt },
    ]);
    const foxer = {
      id: "fox-1",
      name: "Ada Fox",
      imgId: "avatars/ada.jpg",
      city: "Makati",
      state: "Metro Manila",
      roleType: ["eventFoxer"],
    };
    prisma.user.findMany.mockResolvedValue([foxer]);

    const result = await FavoriteRepo.getUserFavorites("u-1");

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["fox-1", "gone"] } },
      select: {
        id: true,
        name: true,
        imgId: true,
        city: true,
        state: true,
        roleType: true,
      },
    });
    expect(prisma.venue.findMany).not.toHaveBeenCalled();
    expect(result).toEqual([
      { id: "f-1", targetId: "fox-1", type: "foxer", createdAt, foxer },
      {
        id: "f-2",
        targetId: "gone",
        type: "foxer",
        createdAt,
        foxer: undefined,
      },
    ]);
  });
});
