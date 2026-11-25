import { describe, it, expect, afterEach } from "vitest";

/**
 * Listings take the Provider subcategories (api#503 follow-up): gear as
 * Tents or Lighting, a service as Photo booth or Hair & makeup. Only the
 * create routes' validation is under test; the services are swapped out.
 */

import AssetCtrl from "../src/modules/asset/asset.controller";
import AssetSvc from "../src/modules/asset/asset.service";
import ServiceCtrl from "../src/modules/service/service.controller";
import ServiceSvc from "../src/modules/service/service.service";
import { isPerformerServiceCategory } from "../src/types/permissions";

const originalAsset = AssetSvc.createAsset;
const originalService = ServiceSvc.createService;
let received: Record<string, unknown> | undefined;

function response() {
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

const user = { userId: "u1", roleType: ["providerFoxer"] };

async function createAsset(category: string) {
  const res = response();
  await AssetCtrl.createAsset(
    {
      body: { category, name: "Item", price: 1, status: "draft" },
      user,
    } as never,
    res as never,
  );
  return res;
}

async function createService(category: string) {
  const res = response();
  await ServiceCtrl.createService(
    {
      body: {
        category,
        name: "Item",
        city: "N/A",
        country: "PH",
        price: 1,
        status: "draft",
      },
      user,
    } as never,
    res as never,
  );
  return res;
}

describe("listing subcategories", () => {
  afterEach(() => {
    AssetSvc.createAsset = originalAsset;
    ServiceSvc.createService = originalService;
  });

  function capture() {
    received = undefined;
    AssetSvc.createAsset = (async (data: Record<string, unknown>) => {
      received = data;
      return data;
    }) as never;
    ServiceSvc.createService = (async (data: Record<string, unknown>) => {
      received = data;
      return data;
    }) as never;
  }

  it.each(["tents", "lighting", "generators_power", "gowns_suits"])(
    "takes gear as %s",
    async (category) => {
      capture();
      const res = await createAsset(category);
      expect(res.statusCode).toBeLessThan(300);
      expect(received?.category).toBe(category);
    },
  );

  it.each(["photo_booth", "hair_makeup", "mobile_bar", "guest_shuttles"])(
    "takes a service as %s",
    async (category) => {
      capture();
      const res = await createService(category);
      expect(res.statusCode).toBeLessThan(300);
      expect(received?.category).toBe(category);
    },
  );

  it("still refuses a category of the other kind", async () => {
    capture();
    expect((await createAsset("photo_booth")).statusCode).toBe(400);
    expect((await createService("tents")).statusCode).toBe(400);
  });

  it("counts the new performers as performers", () => {
    expect(isPerformerServiceCategory("dancers")).toBe(true);
    expect(isPerformerServiceCategory("solo_performer")).toBe(true);
    expect(isPerformerServiceCategory("kids_entertainers")).toBe(true);
    expect(isPerformerServiceCategory("catering")).toBe(false);
  });
});
