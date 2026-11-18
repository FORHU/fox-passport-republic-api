import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * RR-3 (api#300) I2: a Provider edits their specialties in profile settings.
 * They keep at least one, every one is in the catalog, and one with a booking
 * ahead stays. Repositories are stubbed; the rules are real.
 */

const repo = vi.hoisted(() => ({
  findRoleTypes: vi.fn(),
  findProviderSpecialtyCategories: vi.fn(),
  categoriesWithUpcomingBookings: vi.fn(),
  replaceProviderSpecialties: vi.fn(async () => {}),
  updateProfile: vi.fn(async () => ({ id: "u1" })),
  findProfileById: vi.fn(),
  findByUsernameExcludingUserId: vi.fn(async () => null),
}));
vi.mock("../src/modules/profile/profile.repository", () => ({
  default: repo,
}));
vi.mock("../src/modules/category/category.repository", () => ({
  default: {
    getProviderSpecialties: vi.fn(async () => [
      { slug: "dj", name: "DJ" },
      { slug: "photography", name: "Photography" },
      { slug: "videography", name: "Videography" },
    ]),
  },
}));
vi.mock("../src/modules/onboarding/onboarding.service", () => ({
  default: { syncDetectedSteps: vi.fn(async () => {}) },
}));
vi.mock("../src/modules/auth/sessions.service", () => ({
  revokeAllSessions: vi.fn(),
}));
vi.mock("../src/modules/audit/audit.service", () => ({
  recordChange: vi.fn(),
}));
vi.mock("../src/utils/prisma", () => ({ prisma: {} }));

const { default: ProfileSvc, SpecialtyError } =
  await import("../src/modules/profile/profile.service");

function asProvider(current: string[], withBookings: string[] = []) {
  repo.findRoleTypes.mockResolvedValue(["providerFoxer"]);
  repo.findProviderSpecialtyCategories.mockResolvedValue(current);
  repo.categoriesWithUpcomingBookings.mockImplementation(
    async (_id: string, categories: string[]) =>
      categories.filter((c) => withBookings.includes(c)),
  );
}

beforeEach(() => vi.clearAllMocks());

describe("ProfileSvc.setProviderSpecialties", () => {
  it("refuses anyone who is not a Provider", async () => {
    repo.findRoleTypes.mockResolvedValue(["venueFoxer"]);
    await expect(
      ProfileSvc.setProviderSpecialties("u1", ["dj"]),
    ).rejects.toThrow("Only Providers have specialties");
    expect(repo.replaceProviderSpecialties).not.toHaveBeenCalled();
  });

  it("refuses an empty list, so a Provider keeps their last specialty", async () => {
    asProvider(["dj"]);
    await expect(ProfileSvc.setProviderSpecialties("u1", [])).rejects.toThrow(
      "Choose at least one specialty",
    );
    expect(repo.replaceProviderSpecialties).not.toHaveBeenCalled();
  });

  it("refuses a slug that is not in the catalog", async () => {
    asProvider(["dj"]);
    await expect(
      ProfileSvc.setProviderSpecialties("u1", ["dj", "plumbing"]),
    ).rejects.toThrow("Unknown specialty: plumbing");
    expect(repo.replaceProviderSpecialties).not.toHaveBeenCalled();
  });

  it("refuses to remove a specialty that has bookings ahead", async () => {
    asProvider(["dj", "photography"], ["photography"]);
    await expect(
      ProfileSvc.setProviderSpecialties("u1", ["dj"]),
    ).rejects.toThrow(
      "You can't remove photography while it has upcoming bookings",
    );
    expect(repo.replaceProviderSpecialties).not.toHaveBeenCalled();
  });

  it("removes a specialty with no bookings ahead", async () => {
    asProvider(["dj", "photography"]);
    await ProfileSvc.setProviderSpecialties("u1", ["dj"]);
    expect(repo.replaceProviderSpecialties).toHaveBeenCalledWith(
      "u1",
      ["photography"],
      [],
    );
  });

  it("adds a specialty and keeps the others", async () => {
    asProvider(["dj"]);
    await ProfileSvc.setProviderSpecialties("u1", ["dj", "videography"]);
    expect(repo.replaceProviderSpecialties).toHaveBeenCalledWith(
      "u1",
      [],
      ["videography"],
    );
  });

  it("only checks bookings for the specialties being removed", async () => {
    asProvider(["dj", "photography"], ["dj"]);
    await ProfileSvc.setProviderSpecialties("u1", [
      "dj",
      "photography",
      "videography",
    ]);
    expect(repo.categoriesWithUpcomingBookings).toHaveBeenCalledWith("u1", []);
    expect(repo.replaceProviderSpecialties).toHaveBeenCalled();
  });

  it("accepts the list it was given back, even a specialty with no catalog row", async () => {
    asProvider(["dj", "other"]);
    await ProfileSvc.setProviderSpecialties("u1", ["dj", "other"]);
    expect(repo.replaceProviderSpecialties).not.toHaveBeenCalled();
  });

  it("lets a Provider drop a specialty with no catalog row", async () => {
    asProvider(["dj", "other"]);
    await ProfileSvc.setProviderSpecialties("u1", ["dj"]);
    expect(repo.replaceProviderSpecialties).toHaveBeenCalledWith(
      "u1",
      ["other"],
      [],
    );
  });

  it("writes nothing when the list has not changed", async () => {
    asProvider(["dj", "photography"]);
    await ProfileSvc.setProviderSpecialties("u1", ["photography", "dj"]);
    expect(repo.replaceProviderSpecialties).not.toHaveBeenCalled();
  });

  it("names the specialties field on a refusal", async () => {
    repo.findRoleTypes.mockResolvedValue(["citizen"]);
    await expect(
      ProfileSvc.setProviderSpecialties("u1", ["dj"]),
    ).rejects.toBeInstanceOf(SpecialtyError);
    await ProfileSvc.setProviderSpecialties("u1", ["dj"]).catch((e) =>
      expect(e.field).toBe("specialties"),
    );
  });
});

describe("ProfileSvc.updateProfile with specialties", () => {
  it("saves nothing else when the specialties are refused", async () => {
    asProvider(["dj"]);
    await expect(
      ProfileSvc.updateProfile("u1", { bio: "New bio", specialties: [] }),
    ).rejects.toThrow("Choose at least one specialty");
    expect(repo.updateProfile).not.toHaveBeenCalled();
  });

  it("saves the specialties and the rest together", async () => {
    asProvider(["dj"]);
    await ProfileSvc.updateProfile("u1", {
      bio: "New bio",
      specialties: ["dj", "photography"],
    });
    expect(repo.replaceProviderSpecialties).toHaveBeenCalledWith(
      "u1",
      [],
      ["photography"],
    );
    expect(repo.updateProfile).toHaveBeenCalledTimes(1);
  });

  it("leaves specialties alone when the request has none", async () => {
    await ProfileSvc.updateProfile("u1", { bio: "Only the bio" });
    expect(repo.findRoleTypes).not.toHaveBeenCalled();
    expect(repo.replaceProviderSpecialties).not.toHaveBeenCalled();
  });
});

describe("ProfileSvc.getProfile", () => {
  const base = { id: "u1", systemRole: "user" };

  it("lists a Provider's specialties with their names", async () => {
    repo.findProfileById.mockResolvedValue({
      ...base,
      roleType: ["providerFoxer"],
    });
    repo.findProviderSpecialtyCategories.mockResolvedValue([
      "dj",
      "sound_system",
    ]);
    const profile = await ProfileSvc.getProfile("u1");
    expect(profile.specialties).toEqual([
      { slug: "dj", name: "DJ" },
      { slug: "sound_system", name: "sound_system" },
    ]);
  });

  it("sends no specialties for someone who is not a Provider", async () => {
    repo.findProfileById.mockResolvedValue({ ...base, roleType: [] });
    const profile = await ProfileSvc.getProfile("u1");
    expect(profile).not.toHaveProperty("specialties");
  });
});
