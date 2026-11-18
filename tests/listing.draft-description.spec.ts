import { describe, it, expect, afterEach } from "vitest";

/**
 * A Gear or Talent draft needs only a title: the create routes must let a
 * missing or blank description through to the service, which requires one
 * only past draft (see listing-images.spec.ts).
 */

import AssetCtrl from "../src/modules/asset/asset.controller";
import AssetSvc from "../src/modules/asset/asset.service";
import ServiceCtrl from "../src/modules/service/service.controller";
import ServiceSvc from "../src/modules/service/service.service";
import { DESCRIPTION_MAX } from "../src/utils/limits";

// Swapped by hand and put back, so the test does not depend on module mocking.
const originalAsset = AssetSvc.createAsset;
const originalService = ServiceSvc.createService;
let received: Record<string, unknown> | undefined;

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
const routes = [
  [
    "asset",
    (body: object) => {
      const res = response();
      return AssetCtrl.createAsset({ body, user } as never, res as never).then(
        () => res,
      );
    },
    { category: "sound_system", name: "Speaker", price: 1, status: "draft" },
  ],
  [
    "service",
    (body: object) => {
      const res = response();
      return ServiceCtrl.createService(
        { body, user } as never,
        res as never,
      ).then(() => res);
    },
    {
      category: "photography",
      name: "Portraits",
      city: "N/A",
      country: "PH",
      price: 1,
      status: "draft",
    },
  ],
] as const;

describe.each(routes)("POST /%s/create draft", (_name, create, draft) => {
  afterEach(() => {
    AssetSvc.createAsset = originalAsset;
    ServiceSvc.createService = originalService;
  });

  it("accepts a draft with no description", async () => {
    capture();
    const res = await create(draft);
    expect(res.statusCode).toBe(201);
    expect(received).toBeDefined();
  });

  it.each([[""], ["   "]])(
    "accepts a draft whose description is %j",
    async (description) => {
      capture();
      const res = await create({ ...draft, description });
      expect(res.statusCode).toBe(201);
      expect(received?.description).toBe("");
    },
  );

  it("still caps the description length", async () => {
    capture();
    const res = await create({
      ...draft,
      description: "a".repeat(DESCRIPTION_MAX + 1),
    });
    expect(res.statusCode).toBe(400);
    expect(received).toBeUndefined();
  });
});
