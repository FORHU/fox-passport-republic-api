export type LngLat = [number, number]; // [lng, lat], matches GeoJSON/Mapbox order

export const MIN_POLYGON_VERTICES = 3;
export const MAX_POLYGON_VERTICES = 100;

// Below this shoelace-formula area (in squared degrees) a "polygon" is
// treated as a degenerate sliver/line rather than a real service area.
const MIN_POLYGON_AREA_DEG2 = 1e-10;

function closeRing(ring: LngLat[]): LngLat[] {
  const [first] = ring;
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
}

/** Signed area via the shoelace formula; magnitude only matters here. */
function ringArea(ring: LngLat[]): number {
  const closed = closeRing(ring);
  let sum = 0;
  for (let i = 0; i < closed.length - 1; i++) {
    const [x1, y1] = closed[i];
    const [x2, y2] = closed[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/**
 * Rejects shapes too degenerate to be a service area: too few/many vertices,
 * non-finite coordinates, or (near-)zero enclosed area (a line or a
 * duplicated point dressed up as a polygon).
 */
export function validatePolygon(ring: LngLat[]): string | null {
  if (!Array.isArray(ring) || ring.length < MIN_POLYGON_VERTICES) {
    return `A service area needs at least ${MIN_POLYGON_VERTICES} points`;
  }
  if (ring.length > MAX_POLYGON_VERTICES) {
    return `A service area can have at most ${MAX_POLYGON_VERTICES} points`;
  }
  for (const point of ring) {
    if (
      !Array.isArray(point) ||
      point.length !== 2 ||
      !Number.isFinite(point[0]) ||
      !Number.isFinite(point[1]) ||
      point[0] < -180 ||
      point[0] > 180 ||
      point[1] < -90 ||
      point[1] > 90
    ) {
      return "Every point must be a valid [lng, lat] pair";
    }
  }
  if (Math.abs(ringArea(ring)) < MIN_POLYGON_AREA_DEG2) {
    return "The service area is too small or too thin to be a real shape";
  }
  return null;
}

/** Vertex average — good enough for a display marker, not an area centroid. */
export function polygonCentroid(ring: LngLat[]): { lat: number; lng: number } {
  const sum = ring.reduce(
    (acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }),
    { lng: 0, lat: 0 },
  );
  return { lat: sum.lat / ring.length, lng: sum.lng / ring.length };
}

function pointInPolygon(point: LngLat, ring: LngLat[]): boolean {
  const [x, y] = point;
  let inside = false;
  const closed = closeRing(ring);

  for (let i = 0, j = closed.length - 2; i < closed.length - 1; j = i++) {
    const [xi, yi] = closed[i];
    const [xj, yj] = closed[j];
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** True when segments (p1,p2) and (p3,p4) cross (touching counts). */
function segmentsIntersect(
  p1: LngLat,
  p2: LngLat,
  p3: LngLat,
  p4: LngLat,
): boolean {
  const orientation = (a: LngLat, b: LngLat, c: LngLat) => {
    const val = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
    if (Math.abs(val) < Number.EPSILON) return 0;
    return val > 0 ? 1 : 2;
  };
  const onSegment = (a: LngLat, b: LngLat, c: LngLat) =>
    b[0] <= Math.max(a[0], c[0]) &&
    b[0] >= Math.min(a[0], c[0]) &&
    b[1] <= Math.max(a[1], c[1]) &&
    b[1] >= Math.min(a[1], c[1]);

  const o1 = orientation(p1, p2, p3);
  const o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1);
  const o4 = orientation(p3, p4, p2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p3, p2)) return true;
  if (o2 === 0 && onSegment(p1, p4, p2)) return true;
  if (o3 === 0 && onSegment(p3, p1, p4)) return true;
  if (o4 === 0 && onSegment(p3, p2, p4)) return true;
  return false;
}

/**
 * True when two service-area polygons overlap: either an edge from one
 * crosses an edge of the other, or one is fully contained inside the other
 * (which has no crossing edges to detect).
 */
export function polygonsOverlap(a: LngLat[], b: LngLat[]): boolean {
  const ringA = closeRing(a);
  const ringB = closeRing(b);

  for (let i = 0; i < ringA.length - 1; i++) {
    for (let j = 0; j < ringB.length - 1; j++) {
      if (segmentsIntersect(ringA[i], ringA[i + 1], ringB[j], ringB[j + 1])) {
        return true;
      }
    }
  }

  return pointInPolygon(ringA[0], ringB) || pointInPolygon(ringB[0], ringA);
}

export { pointInPolygon };
