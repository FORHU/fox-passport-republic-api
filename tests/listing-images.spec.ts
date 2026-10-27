import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Gear and Talent listings may be saved as drafts with no image, so an owner
 * can keep their progress; publishing (any status past draft) needs one. The
 * same rule holds on create and on update, for assets and services alike.
 */

const assetRepo = vi.hoisted(() => ({
  createAsset: vi.fn(async (d: unknown) => d),
  findAssetById: vi.fn(),
  updateAsset: vi.fn(async (_id: string, d: unknown) => d),
}));
const serviceRepo = vi.hoisted(() => ({
  createService: vi.fn(async (d: unknown) => d),
  getServiceById: vi.fn(),
  updateService: vi.fn(async (_id: string, d: unknown) => d),
}));

vi.mock("../src/modules/asset/asset.repository", () => ({
  default: assetRepo,
}));
vi.mock("../src/modules/service/service.repository", () => ({
  default: serviceRepo,
}));
vi.mock("../src/utils/cache-namespaces", () => ({
  assetCache: { cached: vi.fn() },
  serviceCache: { cached: vi.fn() },
}));

import AssetSvc from "../src/modules/asset/asset.service";
import ServiceSvc from "../src/modules/service/service.service";
import {
  assertListingImages,
  PUBLISH_NEEDS_IMAGE,
} from "../src/utils/listing-images";

const asset = {
  ownerId: "u1",
  category: "sound_system" as never,
  name: "Speaker",
  description: " ",
  price: 1,
};
const service = {
  ownerId: "u1",
  category: "other" as never,
  name: "Photography",
  description: " ",
  city: "N/A",
  country: "PH",
  price: 1,
};

beforeEach(() => vi.clearAllMocks());

describe("assertListingImages", () => {
  it("lets a draft have no image", () => {
    expect(() => assertListingImages("draft", 0)).not.toThrow();
  });

  it("needs an image for anything past draft", () => {
    expect(() => assertListingImages("pending", 0)).toThrow(
      PUBLISH_NEEDS_IMAGE,
    );
    expect(() => assertListingImages("available", 1)).not.toThrow();
  });

  it("caps a listing at five images", () => {
    expect(() => assertListingImages("draft", 6)).toThrow(/maximum of 5/);
  });
});

describe.each([
  ["asset", () => AssetSvc.createAsset(asset), assetRepo.createAsset],
  [
    "service",
    () => ServiceSvc.createService(service),
    serviceRepo.createService,
  ],
])("creating a %s", (_name, createDraft, repoCreate) => {
  it("saves a draft with no image", async () => {
    await createDraft();
    expect(repoCreate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "draft", imgIds: [] }),
    );
  });
});

describe("creating past draft without an image", () => {
  it("is refused for an asset", async () => {
    await expect(
      AssetSvc.createAsset({ ...asset, status: "pending" as never }),
    ).rejects.toThrow(PUBLISH_NEEDS_IMAGE);
    expect(assetRepo.createAsset).not.toHaveBeenCalled();
  });

  it("is refused for a service", async () => {
    await expect(
      ServiceSvc.createService({ ...service, status: "pending" as never }),
    ).rejects.toThrow(PUBLISH_NEEDS_IMAGE);
    expect(serviceRepo.createService).not.toHaveBeenCalled();
  });
});

describe.each([
  [
    "asset",
    assetRepo.findAssetById,
    assetRepo.updateAsset,
    (data: object) => AssetSvc.updateAsset("a1", "u1", data),
  ],
  [
    "service",
    serviceRepo.getServiceById,
    serviceRepo.updateService,
    (data: object) => ServiceSvc.updateService("a1", "u1", data),
  ],
])("updating a %s", (_name, find, repoUpdate, update) => {
  const draft = { id: "a1", ownerId: "u1", status: "draft", images: [] };

  it("refuses to publish a draft that has no image", async () => {
    find.mockResolvedValue(draft);
    await expect(update({ status: "pending" })).rejects.toThrow(
      PUBLISH_NEEDS_IMAGE,
    );
    expect(repoUpdate).not.toHaveBeenCalled();
  });

  it("publishes a draft when the image comes with it", async () => {
    find.mockResolvedValue(draft);
    await update({ status: "pending", imgIds: ["f1"] });
    expect(repoUpdate).toHaveBeenCalledWith("a1", {
      status: "pending",
      imgIds: ["f1"],
    });
  });

  it("publishes a draft that already has an image", async () => {
    find.mockResolvedValue({ ...draft, images: [{ id: "f1" }] });
    await update({ status: "pending" });
    expect(repoUpdate).toHaveBeenCalled();
  });

  it("keeps editing a draft without an image", async () => {
    find.mockResolvedValue(draft);
    await update({ name: "Renamed", status: "draft" });
    expect(repoUpdate).toHaveBeenCalled();
  });

  it("still edits an older live listing that has no image", async () => {
    find.mockResolvedValue({ ...draft, status: "available" });
    await update({ name: "Renamed", status: "available" });
    expect(repoUpdate).toHaveBeenCalled();
  });
});
