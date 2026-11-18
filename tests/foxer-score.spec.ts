import { describe, it, expect } from "vitest";
import {
  calculateRatingScore,
  calculateVolumeScore,
  calculateResponsivenessScore,
  calculateReliabilityScore,
  calculateTrustScore,
} from "../src/modules/foxer-score/foxer-score.service";

describe("Foxer Score Calculation (requirements/xp-and-coins.md section 9.1)", () => {
  describe("Rating Component (Weight: 45 pts)", () => {
    it("returns platform average scaled when review count is 0", () => {
      const { ratingScore, bayesianRating } = calculateRatingScore(0, 0, 4.5);
      expect(bayesianRating).toBe(4.5);
      // (4.5 - 1) / 4 * 45 = 3.5 / 4 * 45 = 39.4
      expect(ratingScore).toBeCloseTo(39.4, 1);
    });

    it("applies Bayesian prior so single 5-star review does not achieve full 45 points", () => {
      // 1 review of 5.0 with platform average 4.0: (1*5 + 5*4) / (1+5) = 25/6 = 4.17
      const { ratingScore, bayesianRating } = calculateRatingScore(1, 5.0, 4.0);
      expect(bayesianRating).toBeCloseTo(4.17, 2);
      expect(ratingScore).toBeLessThan(45);
      expect(ratingScore).toBeCloseTo(35.6, 1);
    });

    it("approaches full 45 points as high volume of 5-star reviews accumulates", () => {
      // 100 reviews of 5.0 with platform avg 4.0: (100*5 + 20) / 105 = 520 / 105 = 4.95
      const { ratingScore, bayesianRating } = calculateRatingScore(
        100,
        5.0,
        4.0,
      );
      expect(bayesianRating).toBeGreaterThanOrEqual(4.95);
      expect(ratingScore).toBeGreaterThanOrEqual(44.4);
    });

    it("scales 1-star reviews down to 0 points", () => {
      const { ratingScore } = calculateRatingScore(100, 1.0, 1.0);
      expect(ratingScore).toBe(0);
    });
  });

  describe("Volume Component (Weight: 20 pts)", () => {
    it("returns 0 points for 0 completed bookings", () => {
      expect(calculateVolumeScore(0)).toBe(0);
      expect(calculateVolumeScore(-5)).toBe(0);
    });

    it("scales logarithmically with full marks (20 pts) at 100 completed bookings", () => {
      const score10 = calculateVolumeScore(10);
      const score100 = calculateVolumeScore(100);
      const score500 = calculateVolumeScore(500);

      expect(score10).toBeGreaterThan(0);
      expect(score10).toBeLessThan(score100);
      expect(score100).toBe(20);
      // Capped at 20
      expect(score500).toBe(20);
    });
  });

  describe("Responsiveness Component (Weight: 15 pts)", () => {
    it("gives full marks (15 pts) when all requests are answered within 24h", () => {
      const { responsivenessScore, responsivenessRate } =
        calculateResponsivenessScore(10, 10);
      expect(responsivenessScore).toBe(15);
      expect(responsivenessRate).toBe(1.0);
    });

    it("gives 0 points if 0 requests were answered within 24h", () => {
      const { responsivenessScore, responsivenessRate } =
        calculateResponsivenessScore(10, 0);
      expect(responsivenessScore).toBe(0);
      expect(responsivenessRate).toBe(0);
    });

    it("gives default clean score when no requests exist", () => {
      const { responsivenessScore, responsivenessRate } =
        calculateResponsivenessScore(0, 0);
      expect(responsivenessScore).toBe(15);
      expect(responsivenessRate).toBe(1.0);
    });
  });

  describe("Reliability Component (Weight: 15 pts)", () => {
    it("gives full marks (15 pts) when zero bookings were cancelled", () => {
      const { reliabilityScore, cancellationRate } = calculateReliabilityScore(
        20,
        0,
      );
      expect(reliabilityScore).toBe(15);
      expect(cancellationRate).toBe(0);
    });

    it("penalizes for Foxer cancellations over the last 20 bookings", () => {
      // 2 cancellations out of 20 = 10% cancellation rate -> 90% reliability -> 13.5 pts
      const { reliabilityScore, cancellationRate } = calculateReliabilityScore(
        20,
        2,
      );
      expect(cancellationRate).toBe(0.1);
      expect(reliabilityScore).toBe(13.5);
    });

    it("gives 0 points if all recent bookings were cancelled by the Foxer", () => {
      const { reliabilityScore, cancellationRate } = calculateReliabilityScore(
        20,
        20,
      );
      expect(cancellationRate).toBe(1.0);
      expect(reliabilityScore).toBe(0);
    });
  });

  describe("Trust Component (Weight: 5 pts)", () => {
    it("grants the full 5 points for a verified identity", () => {
      expect(calculateTrustScore(true)).toBe(5);
    });

    it("grants 0 points when the identity is not verified", () => {
      expect(calculateTrustScore(false)).toBe(0);
    });
  });
});
