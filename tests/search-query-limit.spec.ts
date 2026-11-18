import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { SEARCH_QUERY_MAX } from "../src/utils/limits";
import { searchQuery } from "../src/utils/search-terms";

const usersSvc = vi.hoisted(() => ({ getFoxers: vi.fn() }));
const assetSvc = vi.hoisted(() => ({ browseAssets: vi.fn() }));
const serviceSvc = vi.hoisted(() => ({ browseServices: vi.fn() }));
vi.mock("../src/modules/users/users.service", () => ({ default: usersSvc }));
vi.mock("../src/modules/asset/asset.service", () => ({ default: assetSvc }));
vi.mock("../src/modules/service/service.service", () => ({
  default: serviceSvc,
}));
// The asset and service controllers import the socket layer; keep it inert.
vi.mock("../src/infrastructure/socket/invalidate", () => ({
  announceAdminQueueChanged: vi.fn(),
}));

import UsersCtrl from "../src/modules/users/users.controller";
import AssetCtrl from "../src/modules/asset/asset.controller";
import ServiceCtrl from "../src/modules/service/service.controller";

/**
 * The Foxers search (app#300): `q` had no length limit, so a pasted essay
 * reached the search filters (and the Foxer cache key) in full. The endpoints
 * now cut it to the search box's 200 characters instead of rejecting it.
 */

const LONG = "a".repeat(500);

describe("searchQuery", () => {
  it("cuts a long query to SEARCH_QUERY_MAX", () => {
    expect(SEARCH_QUERY_MAX).toBe(200);
    expect(searchQuery(LONG)).toBe("a".repeat(200));
  });

  it("trims whitespace, also where the cut lands", () => {
    expect(searchQuery("  ada  ")).toBe("ada");
    expect(searchQuery(`${"b".repeat(199)} tail`)).toBe("b".repeat(199));
  });

  it("is no search for blank or non-string values", () => {
    expect(searchQuery(undefined)).toBeUndefined();
    expect(searchQuery("   ")).toBeUndefined();
    expect(searchQuery(["a", "b"])).toBeUndefined();
    expect(searchQuery({ q: "a" })).toBeUndefined();
  });
});

describe("Foxer search endpoints cap q", () => {
  const res = () => ({
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  });
  const req = (query: Record<string, unknown>) =>
    ({ query }) as unknown as Request;

  beforeEach(() => {
    usersSvc.getFoxers.mockReset();
    usersSvc.getFoxers.mockResolvedValue({
      foxers: [],
      total: 0,
      totalPages: 0,
    });
    assetSvc.browseAssets.mockReset();
    assetSvc.browseAssets.mockResolvedValue({ assets: [], total: 0 });
    serviceSvc.browseServices.mockReset();
    serviceSvc.browseServices.mockResolvedValue({ services: [], total: 0 });
  });

  it("GET /users/foxers searches the first 200 characters", async () => {
    const r = res();
    await UsersCtrl.getFoxers(req({ q: LONG }), r as unknown as Response);
    expect(r.status).toHaveBeenCalledWith(200);
    const search = usersSvc.getFoxers.mock.calls[0][6];
    expect(search).toBe("a".repeat(200));
  });

  it("GET /users/foxers ignores a repeated q", async () => {
    const r = res();
    await UsersCtrl.getFoxers(req({ q: ["a", "b"] }), r as unknown as Response);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(usersSvc.getFoxers.mock.calls[0][6]).toBeUndefined();
  });

  it("GET /asset/browse searches the first 200 characters", async () => {
    const r = res();
    await AssetCtrl.browseAssets(req({ q: LONG }), r as unknown as Response);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(assetSvc.browseAssets.mock.calls[0][0].q).toBe("a".repeat(200));
  });

  it("GET /service/browse searches the first 200 characters", async () => {
    const r = res();
    await ServiceCtrl.browseServices(
      req({ q: LONG }),
      r as unknown as Response,
    );
    expect(r.status).toHaveBeenCalledWith(200);
    expect(serviceSvc.browseServices.mock.calls[0][0].q).toBe("a".repeat(200));
  });
});
