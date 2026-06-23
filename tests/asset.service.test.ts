import { expect } from "chai";
import { prisma } from "../src/utils/prisma";
import AssetSvc from "../src/services/asset.service";
import AssetRentalSvc from "../src/services/assetRental.service";

describe("Asset Service", () => {
  let owner: any;
  let host: any;
  let asset: any;

  before(async () => {
    // create users: owner, host, and renter
    owner = await prisma.user.create({
      data: { email: "owner@example.com", password: "pass", name: "Owner" },
    });
    host = await prisma.user.create({
      data: { email: "host@example.com", password: "pass", name: "Host" },
    });
    // additional user to rent assets
    await prisma.user.create({
      data: { email: "renter@example.com", password: "pass", name: "Renter" },
    });
  });

  after(async () => {
    // cleanup test data
    await prisma.assetImage.deleteMany({});
    await prisma.asset.deleteMany({});
    await prisma.user.deleteMany({
      where: { email: { in: ["owner@example.com", "host@example.com"] } },
    });
    await prisma.$disconnect();
  });

  it("should create an asset and update its images", async () => {
    asset = await AssetSvc.createAsset({
      ownerId: owner.id,
      hostId: host.id,
      name: "Test Asset",
      description: "Some description",
    });

    expect(asset).to.have.property("id");

    const updated = await AssetSvc.updateAsset(asset.id, owner.id, {
      images: [
        { url: "http://foo.com/img1.jpg", altText: "img1" },
        { url: "http://foo.com/img2.jpg", altText: "img2", isThumbnail: true },
      ],
    });

    expect(updated.assetImages).to.be.an("array").with.length(2);
    expect(updated.assetImages[0].url).to.equal("http://foo.com/img1.jpg");
    expect(updated.assetImages[1].url).to.equal("http://foo.com/img2.jpg");

    // clearing images by passing empty array should remove existing ones
    const cleared = await AssetSvc.updateAsset(asset.id, owner.id, { images: [] });
    expect(cleared.assetImages).to.be.an("array").with.length(0);
  });

  it("should allow a non-owner user to rent the asset", async () => {
    // renter created in before hook (email renter@example.com)
    const renter = await prisma.user.findUnique({ where: { email: "renter@example.com" } });
    if (!renter) throw new Error("renter not found");

    const start = new Date();
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // two hours later

    const rental = await AssetRentalSvc.rentAsset(asset.id, renter.id, start, end);
    expect(rental).to.have.property("id");
    expect(rental.assetId).to.equal(asset.id);
    expect(rental.renterId).to.equal(renter.id);
  });
});
