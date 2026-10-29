import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Editing, archiving and (soft) deleting a hub is open to its owner and to
 * anyone holding `investments:manage`, and to no one else. Delete only flips
 * the status — the row is kept — and a deleted hub reads as gone.
 */

const repo = vi.hoisted(() => ({
  findById: vi.fn(),
  updateInvestment: vi.fn(),
  deleteInvestment: vi.fn(),
}));
const users = vi.hoisted(() => ({ findUserById: vi.fn() }));
vi.mock("../src/modules/investment/investment.repository", () => ({
  default: repo,
}));
vi.mock("../src/modules/users/users.repository", () => ({ default: users }));
vi.mock("../src/utils/cache-namespaces", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  investmentCache: {
    cached: (_key: string, _ttl: number, fn: () => unknown) => fn(),
  },
}));

import InvestmentSvc from "../src/modules/investment/investment.service";

const PEOPLE: Record<string, object> = {
  owner: { id: "owner", systemRole: "user", roleType: ["investor"] },
  stranger: { id: "stranger", systemRole: "user", roleType: ["investor"] },
  admin: { id: "admin", systemRole: "admin", roleType: [] },
};

let hub: { id: string; partnerId: string; status: string } | null;

beforeEach(() => {
  vi.clearAllMocks();
  hub = { id: "h1", partnerId: "owner", status: "active" };
  repo.findById.mockImplementation(async () => hub);
  repo.updateInvestment.mockImplementation(async (_id, data) => ({
    ...hub,
    ...data,
  }));
  users.findUserById.mockImplementation(async (id: string) => PEOPLE[id]);
});

const actions = {
  update: (who: string) =>
    InvestmentSvc.updateInvestment("h1", who, { title: "New name" }),
  archive: (who: string) => InvestmentSvc.archiveInvestment("h1", who),
  delete: (who: string) => InvestmentSvc.deleteInvestment("h1", who),
};

describe.each(Object.entries(actions))("%s", (_name, act) => {
  it("is allowed for the owner", async () => {
    await expect(act("owner")).resolves.toBeTruthy();
  });

  it("is allowed for an admin on someone else's hub", async () => {
    await expect(act("admin")).resolves.toBeTruthy();
  });

  it("is refused with 403 for anyone else", async () => {
    await expect(act("stranger")).rejects.toMatchObject({ status: 403 });
    expect(repo.updateInvestment).not.toHaveBeenCalled();
  });

  it("is 404 for a missing hub", async () => {
    hub = null;
    await expect(act("owner")).rejects.toMatchObject({ status: 404 });
  });

  it("is 404 for a soft-deleted hub", async () => {
    hub!.status = "deleted";
    await expect(act("owner")).rejects.toMatchObject({ status: 404 });
  });
});

describe("delete", () => {
  it("only flips the status, never removes the row", async () => {
    await InvestmentSvc.deleteInvestment("h1", "owner");
    expect(repo.updateInvestment).toHaveBeenCalledWith("h1", {
      status: "deleted",
    });
    expect(repo.deleteInvestment).not.toHaveBeenCalled();
  });

  it("works on an archived hub", async () => {
    hub!.status = "archived";
    await expect(
      InvestmentSvc.deleteInvestment("h1", "owner"),
    ).resolves.toBeTruthy();
  });
});

describe("archive", () => {
  it("is 400 for a hub that is not active", async () => {
    hub!.status = "archived";
    await expect(
      InvestmentSvc.archiveInvestment("h1", "owner"),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("update", () => {
  it("keeps quantityAvailable in step with quantityTotal", async () => {
    await InvestmentSvc.updateInvestment("h1", "owner", { quantityTotal: 40 });
    expect(repo.updateInvestment).toHaveBeenCalledWith("h1", {
      quantityTotal: 40,
      quantityAvailable: 40,
    });
  });
});

describe("getInvestmentById", () => {
  it("is 404 for a soft-deleted hub", async () => {
    hub!.status = "deleted";
    await expect(InvestmentSvc.getInvestmentById("h1")).rejects.toMatchObject(
      { status: 404 },
    );
  });
});
