import * as THREE from 'three';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../adapt/design';
import type { DesignPoint } from './slashInput';

export type ProjBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type ProjPoly = DesignPoint[];

function ndcToDesign(ndc: THREE.Vector3): DesignPoint {
  return {
    x: (ndc.x * 0.5 + 0.5) * DESIGN_WIDTH,
    y: (-ndc.y * 0.5 + 0.5) * DESIGN_HEIGHT,
  };
}

const _v = new THREE.Vector3();

function convexHull(points: DesignPoint[]): ProjPoly {
  const pts = points
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;

  const cross = (o: DesignPoint, a: DesignPoint, b: DesignPoint) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: DesignPoint[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: DesignPoint[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function projectMeshHull(
  mesh: THREE.Mesh,
  camera: THREE.Camera,
): { hull: ProjPoly; box: ProjBox } | null {
  camera.updateMatrixWorld(true);
  mesh.updateWorldMatrix(true, false);
  const geom = mesh.geometry;
  if (!geom.boundingBox) geom.computeBoundingBox();
  const bb = geom.boundingBox;
  if (!bb) return null;

  const pts: DesignPoint[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < 8; i++) {
    _v.set(
      i & 1 ? bb.max.x : bb.min.x,
      i & 2 ? bb.max.y : bb.min.y,
      i & 4 ? bb.max.z : bb.min.z,
    );
    _v.applyMatrix4(mesh.matrixWorld);
    _v.project(camera);
    if (!Number.isFinite(_v.x) || !Number.isFinite(_v.y)) continue;
    const p = ndcToDesign(_v);
    pts.push(p);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  if (!Number.isFinite(minX) || pts.length < 3) return null;
  return { hull: convexHull(pts), box: { minX, minY, maxX, maxY } };
}

/** Clip segment to convex hull (Cyrus–Beck). Returns chord endpoints or null. */
export function clipChordToHull(
  a: DesignPoint,
  b: DesignPoint,
  hull: ProjPoly,
): [DesignPoint, DesignPoint] | null {
  if (hull.length < 3) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;

  for (let i = 0; i < hull.length; i++) {
    const e0 = hull[i];
    const e1 = hull[(i + 1) % hull.length];
    const ex = e1.x - e0.x;
    const ey = e1.y - e0.y;
    const nx = -ey;
    const ny = ex;
    const denom = nx * dx + ny * dy;
    const num = nx * (a.x - e0.x) + ny * (a.y - e0.y);
    if (Math.abs(denom) < 1e-8) {
      if (num < 0) return null;
      continue;
    }
    const t = -num / denom;
    if (denom > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }

  return [
    { x: a.x + t0 * dx, y: a.y + t0 * dy },
    { x: a.x + t1 * dx, y: a.y + t1 * dy },
  ];
}

export function pointInConvexHull(p: DesignPoint, hull: ProjPoly): boolean {
  if (hull.length < 3) return false;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross < -1e-4) return false;
  }
  return true;
}

export function chordLength(c0: DesignPoint, c1: DesignPoint): number {
  return Math.hypot(c1.x - c0.x, c1.y - c0.y);
}

export function throughThreshold(box: ProjBox): number {
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  return Math.max(6, 0.035 * Math.min(w, h));
}

/** Walk polyline; keep first–last overlap with hull. */
const _ndcHit = new THREE.Vector2();
const _rayHit = new THREE.Raycaster();

export function strokeHitsMesh(
  mesh: THREE.Mesh,
  camera: THREE.Camera,
  points: DesignPoint[],
): DesignPoint[] {
  const hits: DesignPoint[] = [];
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const prev = mats.map((m) => m.side);
  for (const m of mats) m.side = THREE.DoubleSide;
  mesh.updateWorldMatrix(true, false);
  camera.updateMatrixWorld(true);

  const test = (p: DesignPoint): boolean => {
    _ndcHit.set((p.x / DESIGN_WIDTH) * 2 - 1, -(p.y / DESIGN_HEIGHT) * 2 + 1);
    _rayHit.setFromCamera(_ndcHit, camera);
    return _rayHit.intersectObject(mesh, false).length > 0;
  };

  for (let i = 0; i < points.length; i++) {
    if (test(points[i])) hits.push(points[i]);
    else if (i > 0) {
      const a = points[i - 1];
      const b = points[i];
      for (let k = 1; k <= 3; k++) {
        const t = k / 4;
        const m = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        if (test(m)) hits.push(m);
      }
    }
  }

  for (let i = 0; i < mats.length; i++) mats[i].side = prev[i];
  return hits;
}

export function clipPolylineToHull(
  points: DesignPoint[],
  hull: ProjPoly,
): { c0: DesignPoint; c1: DesignPoint; length: number } | null {
  if (points.length < 2 || hull.length < 3) return null;
  let first: DesignPoint | null = null;
  let last: DesignPoint | null = null;
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const clipped = clipChordToHull(points[i - 1], points[i], hull);
    if (!clipped) continue;
    const len = chordLength(clipped[0], clipped[1]);
    if (len < 1e-4) continue;
    if (!first) first = clipped[0];
    last = clipped[1];
    length += len;
  }
  if (!first || !last || length < 1e-4) return null;
  return { c0: first, c1: last, length };
}
