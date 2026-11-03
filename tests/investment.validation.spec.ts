import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

/**
 * POST and PATCH /v1/investments: a physical-inventory hub needs its Equipment
 * Details (title, category, quantity, description) whatever the wizard sent.
 * Every rejected field is named so the wizard can show it under that input.
 */

const createInvestment = vi.hoisted(() => vi.fn(async () => ({ id: "i1" })));
const updateInvestment = vi.hoisted(() => vi.fn(async () => ({ id: "i1" })));
vi.mock("../src/modules/investment/investment.service", () => ({
  default: { createInvestment, updateInvestment },
}));

import InvestmentCtrl from "../src/modules/investment/investment.controller";

type Res = { statusCode: number; body: any };

function fakeRes() {
  return {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

async function create(body: Record<string, unknown>): Promise<Res> {
  const res = fakeRes();
  const req = { user: { userId: "u1" }, body } as unknown as Request;
  await InvestmentCtrl.createInvestment(req, res as unknown as Response);
  return res as Res;
}

async function update(body: Record<string, unknown>): Promise<Res> {
  const res = fakeRes();
  const req = {
    user: { userId: "u1" },
    params: { id: "i1" },
    body,
  } as unknown as Request;
  await InvestmentCtrl.updateInvestment(
    req,
    res as unknown as Response,
    vi.fn(),
  );
  return res as Res;
}

const fieldsOf = (res: Res) =>
  (res.body.fields as { field: string }[]).map((f) => f.field);

const physical = {
  type: "physical_inventory",
  title: "500 Chiavari Chairs",
  description: "White padded chairs, stackable, 45cm seat height.",
  inventoryCategory: "furniture_seating",
  quantityTotal: 500,
  lat: 14.6,
  lng: 121.0,
};

describe("POST /v1/investments validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects physical inventory without category and quantity", async () => {
    const { inventoryCategory, quantityTotal, ...rest } = physical;
    void inventoryCategory;
    void quantityTotal;
    const res = await create(rest);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ success: false, code: "VALIDATION" });
    expect(fieldsOf(res)).toEqual(["inventoryCategory", "quantityTotal"]);
    expect(createInvestment).not.toHaveBeenCalled();
  });

  it("names every empty Equipment Details field at once", async () => {
    const res = await create({
      type: "physical_inventory",
      title: "  ",
      description: "",
    });
    expect(res.statusCode).toBe(400);
    expect(fieldsOf(res)).toEqual([
      "title",
      "description",
      "inventoryCategory",
      "quantityTotal",
    ]);
    expect(res.body.fields[0].message).toBe(
      "Enter a title of at least 3 characters.",
    );
    expect(res.body.fields[2].message).toBe("Choose a category.");
  });

  it("treats a request without a type as physical inventory", async () => {
    const res = await create({
      title: physical.title,
      description: physical.description,
    });
    expect(res.statusCode).toBe(400);
    expect(fieldsOf(res)).toEqual(["inventoryCategory", "quantityTotal"]);
  });

  it("rejects a short title, a zero quantity and an unknown category", async () => {
    const res = await create({
      ...physical,
      title: "ab",
      quantityTotal: 0,
      inventoryCategory: "boats",
    });
    expect(res.statusCode).toBe(400);
    expect(fieldsOf(res)).toEqual([
      "title",
      "inventoryCategory",
      "quantityTotal",
    ]);
  });

  it("accepts a complete hub and drops blank optional text", async () => {
    const res = await create({
      ...physical,
      usageTerms: " ",
      itemCondition: "",
    });
    expect(res.statusCode).toBe(201);
    const sent = (createInvestment.mock.calls[0] as unknown[])[1] as Record<
      string,
      unknown
    >;
    expect(sent).not.toHaveProperty("usageTerms");
    expect(sent).not.toHaveProperty("itemCondition");
    expect(sent.title).toBe(physical.title);
  });

  it("does not require category or quantity for venue equity", async () => {
    const res = await create({
      type: "venue_equity",
      title: "Rooftop revenue share",
      description: "Capital for the rooftop fit-out, paid back from bookings.",
      revenueSharePercent: 20,
    });
    expect(res.statusCode).toBe(201);
    expect(createInvestment).toHaveBeenCalledOnce();
  });
});

describe("PATCH /v1/investments/:id validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("won't clear the title", async () => {
    const res = await update({ title: "  " });
    expect(res.statusCode).toBe(400);
    expect(fieldsOf(res)).toEqual(["title"]);
    expect(updateInvestment).not.toHaveBeenCalled();
  });

  it("still accepts a partial update", async () => {
    const res = await update({ quantityTotal: 20 });
    expect(res.statusCode).toBe(200);
    expect(updateInvestment).toHaveBeenCalledWith("i1", "u1", {
      quantityTotal: 20,
    });
  });
});
