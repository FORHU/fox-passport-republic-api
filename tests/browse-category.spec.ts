import { describe, it, expect, afterEach } from "vitest";
import { AssetCategory, ServiceCategory } from "@prisma/client";
import { prisma } from "../src/utils/prisma";
import AssetRepo from "../src/modules/asset/asset.repository";
import ServiceRepo from "../src/modules/service/service.repository";
import AssetSvc from "../src/modules/asset/asset.service";
import ServiceSvc from "../src/modules/service/service.service";
import AssetCtrl from "../src/modules/asset/asset.controller";
import ServiceCtrl from "../src/modules/service/service.controller";

/**
 * The public browse for gear and services takes a `category`, like the plain
 * lists do: a known one narrows the query, an unknown one is dropped rather
 * than sent to Prisma.
 */

const gear = Object.values(AssetCategory)[0];
const service = Object.values(ServiceCategory)[0];

type Anything = Record<string, any>;

function fakeRes() {
  return {
    statusCode: 0,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(p: unknown) {
      this.payload = p;
      return this;
    },
  };
}

describe("the browse query", () => {
  const model = (name: "asset" | "service") =>
    (prisma as unknown as Record<string, Anything>)[name];
  const saved: Array<() => void> = [];
  afterEach(() => {
    while (saved.length) saved.pop()!();
  });

  /** Swaps findMany/count on a model for a recorder, and puts them back. */
  function record(name: "asset" | "service") {
    const m = model(name);
    const calls: Anything[] = [];
    const [findMany, count] = [m.findMany, m.count];
    m.findMany = async (args: Anything) => {
      calls.push(args);
      return [];
    };
    m.count = async () => 0;
    saved.push(() => {
      m.findMany = findMany;
      m.count = count;
    });
    return calls;
  }

  it("narrows gear to a category, and not at all without one", async () => {
    const calls = record("asset");
    await AssetRepo.findPublicAssets({ limit: 10, category: gear });
    await AssetRepo.findPublicAssets({ limit: 10 });
    expect(calls[0].where.category).toBe(gear);
    expect("category" in calls[1].where).toBe(false);
  });

  it("narrows services to a category, and not at all without one", async () => {
    const calls = record("service");
    await ServiceRepo.findPublicServices({ limit: 10, category: service });
    await ServiceRepo.findPublicServices({ limit: 10 });
    expect(calls[0].where.category).toBe(service);
    expect("category" in calls[1].where).toBe(false);
  });
});

describe("the browse endpoints' category parameter", () => {
  const originals = {
    asset: AssetSvc.browseAssets,
    service: ServiceSvc.browseServices,
  };
  afterEach(() => {
    AssetSvc.browseAssets = originals.asset;
    ServiceSvc.browseServices = originals.service;
  });

  async function filtersFor(kind: "asset" | "service", category?: string) {
    let seen: Anything = {};
    const fake = (async (filters: Anything) => {
      seen = filters;
      return { assets: [], services: [], total: 0 };
    }) as never;
    if (kind === "asset") AssetSvc.browseAssets = fake;
    else ServiceSvc.browseServices = fake;
    const res = fakeRes();
    const req = { query: category ? { category } : {} };
    if (kind === "asset")
      await AssetCtrl.browseAssets(req as never, res as never);
    else await ServiceCtrl.browseServices(req as never, res as never);
    expect(res.statusCode).toBe(200);
    return seen;
  }

  it("passes a known category through to the query", async () => {
    expect((await filtersFor("asset", gear)).category).toBe(gear);
    expect((await filtersFor("service", service)).category).toBe(service);
  });

  it("drops an unknown category instead of failing", async () => {
    expect("category" in (await filtersFor("asset", "nonsense"))).toBe(false);
    expect("category" in (await filtersFor("service", "nonsense"))).toBe(false);
  });

  it("applies no category filter when none is sent", async () => {
    expect("category" in (await filtersFor("asset"))).toBe(false);
    expect("category" in (await filtersFor("service"))).toBe(false);
  });
});
