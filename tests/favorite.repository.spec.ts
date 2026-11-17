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
  it("creates the favourite the first time", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "fox-1" });
    prisma.favorite.findFirst.mockResolvedValue(null);

    await expect(
      FavoriteSvc.addFavorite("u-1", "fox-1", "foxer"),
    ).resolves.toEqual({ added: true });
    expect(prisma.favorite.create).toHaveBeenCalledWith({
      data: { userId: "u-1", entityId: "fox-1", entityType: "foxer" },
    });
  });

  it("keeps the one favourite when added again", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "fox-1" });
    prisma.favorite.findFirst.mockResolvedValue({ id: "fav-1" });

    await expect(
      FavoriteSvc.addFavorite("u-1", "fox-1", "foxer"),
    ).resolves.toEqual({ added: true });
    expect(prisma.favorite.create).not.toHaveBeenCalled();
    expect(prisma.favorite.delete).not.toHaveBeenCalled();
  });

  it("refuses a Foxer id that is no user", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      FavoriteSvc.addFavorite("u-1", "nobody", "foxer"),
    ).rejects.toThrow("Foxer not found");
    expect(prisma.favorite.create).not.toHaveBeenCalled();
  });

  it("refuses saving yourself as a Foxer", async () => {
    await expect(
      FavoriteSvc.addFavorite("u-1", "u-1", "foxer"),
    ).rejects.toThrow("You can't save yourself");
    expect(prisma.favorite.create).not.toHaveBeenCalled();
  });

  it("doesn't look up a user for a venue", async () => {
    prisma.favorite.findFirst.mockResolvedValue(null);

    await FavoriteSvc.addFavorite("u-1", "v-1", "venue");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.favorite.create).toHaveBeenCalled();
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
