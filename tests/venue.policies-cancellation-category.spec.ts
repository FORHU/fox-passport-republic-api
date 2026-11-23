import { describe, it, expect, vi, beforeEach } from "vitest";
import { sanitizeVenuePolicies } from "../src/modules/venue/venue.service";
import CancellationPolicySvc from "../src/modules/cancellation-policy/cancellation-policy.service";
import CancellationPolicyRepo from "../src/modules/cancellation-policy/cancellation-policy.repository";
import VenueCtrl from "../src/modules/venue/venue.controller";
import { prisma } from "../src/utils/prisma";

describe("Venue Policies, Presets, Cancellation & Category Validation (API)", () => {
  describe("sanitizeVenuePolicies", () => {
    it("trims, removes empty/whitespace-only items, and deduplicates case-insensitively", () => {
      const input = [
        "  No smoking indoors  ",
        "",
        "   ",
        "Quiet hours after 10:00 PM",
        "no smoking indoors",
        "No outside catering",
        "NO OUTSIDE CATERING",
      ];
      const result = sanitizeVenuePolicies(input);
      expect(result).toEqual([
        "No smoking indoors",
        "Quiet hours after 10:00 PM",
        "No outside catering",
      ]);
    });

    it("handles undefined or non-array inputs gracefully", () => {
      expect(sanitizeVenuePolicies(undefined)).toEqual([]);
      expect(sanitizeVenuePolicies(null as any)).toEqual([]);
      expect(sanitizeVenuePolicies(["Valid rule"])).toEqual(["Valid rule"]);
    });
  });

  describe("CancellationPolicySvc - Simplified Policies", () => {
    it("getAll() returns only Flexible and Non-Refundable, excluding Moderate and Strict", async () => {
      vi.spyOn(CancellationPolicyRepo, "findAll").mockResolvedValue([
        {
          id: "p1",
          name: "Flexible",
          description: "Flexible cancellation",
          isActive: true,
          rules: [
            {
              id: "r1",
              policyId: "p1",
              hoursBeforeEvent: 24,
              refundPercent: 100,
            },
          ],
        },
        {
          id: "p2",
          name: "Moderate",
          description: "Moderate cancellation",
          isActive: true,
          rules: [
            {
              id: "r2",
              policyId: "p2",
              hoursBeforeEvent: 72,
              refundPercent: 100,
            },
          ],
        },
        {
          id: "p3",
          name: "Strict",
          description: "Strict cancellation",
          isActive: true,
          rules: [
            {
              id: "r3",
              policyId: "p3",
              hoursBeforeEvent: 168,
              refundPercent: 100,
            },
          ],
        },
        {
          id: "p4",
          name: "Non-Refundable",
          description: "No refunds",
          isActive: true,
          rules: [
            { id: "r4", policyId: "p4", hoursBeforeEvent: 0, refundPercent: 0 },
          ],
        },
      ] as any);

      const policies = await CancellationPolicySvc.getAll();
      const names = policies.map((p) => p.name);
      expect(names).toContain("Flexible");
      expect(names).toContain("Non-Refundable");
      expect(names).not.toContain("Moderate");
      expect(names).not.toContain("Strict");
    });

    it("resolvePolicy provisions or resolves Non-Refundable policy", async () => {
      vi.spyOn(prisma.cancellationPolicy, "findFirst").mockResolvedValue({
        id: "non-ref-1",
        name: "Non-Refundable",
        isActive: true,
        rules: [{ id: "r-nr", hoursBeforeEvent: 0, refundPercent: 0 }],
      } as any);

      const id = await CancellationPolicySvc.resolvePolicy({
        cancellationType: "Non-Refundable",
      });
      expect(id).toBe("non-ref-1");
    });

    it("resolvePolicy provisions or resolves Flexible policy with custom refund rule", async () => {
      vi.spyOn(prisma.cancellationPolicy, "findMany").mockResolvedValue([
        {
          id: "flex-custom-1",
          name: "Flexible",
          isActive: true,
          rules: [{ id: "r-flex", hoursBeforeEvent: 48, refundPercent: 80 }],
        },
      ] as any);

      const id = await CancellationPolicySvc.resolvePolicy({
        cancellationType: "Flexible",
        flexibleRefundPercent: 80,
        flexibleRefundHours: 48,
      });
      expect(id).toBe("flex-custom-1");
    });
  });

  describe("Venue Catalog", () => {
    it("getCatalog includes dedicated policies suggestions", () => {
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      VenueCtrl.getCatalog({} as any, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      const data = mockRes.json.mock.calls[0][0];
      expect(data).toHaveProperty("policies");
      expect(Array.isArray(data.policies)).toBe(true);
      expect(data.policies.length).toBeGreaterThan(0);
      expect(data.policies).toContain("No smoking indoors");
    });
  });
});
