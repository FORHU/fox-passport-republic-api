import { describe, it, expect } from "vitest";
import {
  validatePolygon,
  polygonCentroid,
  polygonsOverlap,
  pointInPolygon,
  MIN_POLYGON_VERTICES,
  MAX_POLYGON_VERTICES,
  type LngLat,
} from "../src/utils/geo";

/**
 * Pure geometry backing venue service-area polygons: `assertNoOverlap` and
 * the create/update Joi schemas both go through these functions before a
 * boundary is persisted. Flagged as untested in docs/TOMORROW.md's 5 Sep map
 * audit — this closes that gap for the API side.
 */

const square: LngLat[] = [
  [0, 0],
  [0, 1],
  [1, 1],
  [1, 0],
];

describe("validatePolygon", () => {
  it("accepts a simple square", () => {
    expect(validatePolygon(square)).toBeNull();
  });

  it("rejects fewer than the minimum vertices", () => {
    const tooFew: LngLat[] = Array.from(
      { length: MIN_POLYGON_VERTICES - 1 },
      (_, i) => [i, i] as LngLat,
    );
    expect(validatePolygon(tooFew)).toMatch(/at least/);
  });

  it("rejects more than the maximum vertices", () => {
    const tooMany: LngLat[] = Array.from(
      { length: MAX_POLYGON_VERTICES + 1 },
      (_, i) => [(i % 180) - 90, 0] as LngLat,
    );
    expect(validatePolygon(tooMany)).toMatch(/at most/);
  });

  it("rejects an out-of-range coordinate", () => {
    const bad: LngLat[] = [
      [0, 0],
      [200, 1],
      [1, 1],
    ];
    expect(validatePolygon(bad)).toMatch(/valid \[lng, lat\]/);
  });

  it("rejects a non-finite coordinate", () => {
    const bad: LngLat[] = [
      [0, 0],
      [NaN, 1],
      [1, 1],
    ];
    expect(validatePolygon(bad)).toMatch(/valid \[lng, lat\]/);
  });

  it("rejects a degenerate (zero-area) shape", () => {
    const line: LngLat[] = [
      [0, 0],
      [0.5, 0.5],
      [1, 1],
    ];
    expect(validatePolygon(line)).toMatch(/too small or too thin/);
  });
});

describe("polygonCentroid", () => {
  it("averages the vertices of a square", () => {
    expect(polygonCentroid(square)).toEqual({ lat: 0.5, lng: 0.5 });
  });
});

describe("pointInPolygon", () => {
  it("is true for a point inside the square", () => {
    expect(pointInPolygon([0.5, 0.5], square)).toBe(true);
  });

  it("is false for a point outside the square", () => {
    expect(pointInPolygon([5, 5], square)).toBe(false);
  });
});

describe("polygonsOverlap", () => {
  it("is true for two crossing squares", () => {
    const other: LngLat[] = [
      [0.5, 0.5],
      [0.5, 1.5],
      [1.5, 1.5],
      [1.5, 0.5],
    ];
    expect(polygonsOverlap(square, other)).toBe(true);
  });

  it("is false for two disjoint squares", () => {
    const other: LngLat[] = [
      [10, 10],
      [10, 11],
      [11, 11],
      [11, 10],
    ];
    expect(polygonsOverlap(square, other)).toBe(false);
  });

  it("is true when one polygon is fully contained in the other", () => {
    // No edges cross here — this exercises the point-in-polygon fallback,
    // not the segment-intersection branch.
    const inner: LngLat[] = [
      [0.25, 0.25],
      [0.25, 0.75],
      [0.75, 0.75],
      [0.75, 0.25],
    ];
    expect(polygonsOverlap(square, inner)).toBe(true);
  });
});
