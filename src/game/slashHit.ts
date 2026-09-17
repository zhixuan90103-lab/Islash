import * as THREE from 'three';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../adapt/design';
import { SLASH } from './design';
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
const _ndc = new THREE.Vector2();
const _ray = new THREE.Raycaster();
const _plane = new THREE.Plane();
const _hit = new THREE.Vector3();

/** 屏上设计点 → 板局部 XY（板平面）。 */
export function designToLocalXY(
  p: DesignPoint,
  camera: THREE.Camera,
  mesh: THREE.Mesh,
): DesignPoint | null {
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);
  const origin = new THREE.Vector3();
  mesh.getWorldPosition(origin);
  _plane.setFromNormalAndCoplanarPoint(n, origin);
  _ndc.set((p.x / DESIGN_WIDTH) * 2 - 1, -(p.y / DESIGN_HEIGHT) * 2 + 1);
  _ray.setFromCamera(_ndc, camera);
  if (!_ray.ray.intersectPlane(_plane, _hit)) return null;
  mesh.worldToLocal(_hit);
  return { x: _hit.x, y: _hit.y };
}

/** 板局部 XY → 当前屏上设计点（板在滑入时跟着走）。 */
export function localXYToDesign(
  mesh: THREE.Mesh,
  camera: THREE.Camera,
  lx: number,
  ly: number,
): DesignPoint | null {
  camera.updateMatrixWorld(true);
  mesh.updateWorldMatrix(true, false);
  _v.set(lx, ly, 0).applyMatrix4(mesh.matrixWorld).project(camera);
  if (!Number.isFinite(_v.x) || !Number.isFinite(_v.y)) return null;
  return ndcToDesign(_v);
}

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
  const pos = geom.getAttribute('position');
  if (!pos || pos.count < 3) return null;

  const pts: DesignPoint[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const step = Math.max(1, Math.floor(pos.count / 400));

  for (let i = 0; i < pos.count; i += step) {
    _v.fromBufferAttribute(pos, i);
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

export type HullChord = {
  c0: DesignPoint;
  c1: DesignPoint;
  enterEdge: number;
  exitEdge: number;
};

function clipLineToHull(
  a: DesignPoint,
  b: DesignPoint,
  hull: ProjPoly,
  t0: number,
  t1: number,
): HullChord | null {
  if (hull.length < 3) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx * dx + dy * dy < 1e-12) return null;

  let lo = t0;
  let hi = t1;
  let enterEdge = -1;
  let exitEdge = -1;

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
    if (denom > 0) {
      if (t > lo) {
        lo = t;
        enterEdge = i;
      }
    } else if (t < hi) {
      hi = t;
      exitEdge = i;
    }
    if (lo > hi) return null;
  }

  return {
    c0: { x: a.x + lo * dx, y: a.y + lo * dy },
    c1: { x: a.x + hi * dx, y: a.y + hi * dy },
    enterEdge,
    exitEdge,
  };
}

export function rankedHullEdges(
  p: DesignPoint,
  hull: ProjPoly,
): { edge: number; point: DesignPoint; dist: number }[] {
  const rows: { edge: number; point: DesignPoint; dist: number }[] = [];
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby || 1;
    let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    const qx = a.x + abx * t;
    const qy = a.y + aby * t;
    const dx = p.x - qx;
    const dy = p.y - qy;
    rows.push({
      edge: i,
      point: { x: qx, y: qy },
      dist: Math.hypot(dx, dy),
    });
  }
  rows.sort((x, y) => x.dist - y.dist);
  return rows;
}

export function nearestHullEdge(
  p: DesignPoint,
  hull: ProjPoly,
): { edge: number; point: DesignPoint; dist: number } {
  const rows = rankedHullEdges(p, hull);
  return rows[0] ?? { edge: 0, point: p, dist: Infinity };
}

export function closestHullEdge(p: DesignPoint, hull: ProjPoly): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby || 1;
    let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    const dx = p.x - (a.x + abx * t);
    const dy = p.y - (a.y + aby * t);
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Clip segment to convex hull (Cyrus–Beck). */
export function clipChordToHull(
  a: DesignPoint,
  b: DesignPoint,
  hull: ProjPoly,
): HullChord | null {
  return clipLineToHull(a, b, hull, 0, 1);
}

/**
 * origin 可在包内：沿 origin→tip 向后延伸到入边，向前最多到 tip。
 * 夹缝起点用这个，避免从板中间起笔。
 */
export function clipBackToEnter(
  origin: DesignPoint,
  tip: DesignPoint,
  hull: ProjPoly,
): HullChord | null {
  return clipLineToHull(origin, tip, hull, Number.NEGATIVE_INFINITY, 1);
}

/** Infinite line through a,b clipped to hull. Direction stays a→b. */
export function clipInfiniteLineToHull(
  a: DesignPoint,
  b: DesignPoint,
  hull: ProjPoly,
): [DesignPoint, DesignPoint] | null {
  const hit = clipLineToHull(
    a,
    b,
    hull,
    Number.NEGATIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  );
  return hit ? [hit.c0, hit.c1] : null;
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

/** 轮廓边：1 上 2 下 3 右 4 左（设计坐标 y 向下）。 */
export type HullSide = 1 | 2 | 3 | 4;

export function silhouetteSide(p: DesignPoint, box: ProjBox): HullSide {
  const d1 = Math.abs(p.y - box.minY);
  const d2 = Math.abs(p.y - box.maxY);
  const d3 = Math.abs(p.x - box.maxX);
  const d4 = Math.abs(p.x - box.minX);
  const m = Math.min(d1, d2, d3, d4);
  if (m === d1) return 1;
  if (m === d2) return 2;
  if (m === d3) return 3;
  return 4;
}

export function throughThreshold(box: ProjBox): number {
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  return Math.max(SLASH.minChord, SLASH.hullChordRatio * Math.min(w, h));
}

const _ndcHit = new THREE.Vector2();
const _rayHit = new THREE.Raycaster();

export function tipHitsMesh(
  mesh: THREE.Mesh,
  camera: THREE.Camera,
  tip: DesignPoint,
): boolean {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const prev = mats.map((m) => m.side);
  for (const m of mats) m.side = THREE.DoubleSide;
  _ndcHit.set((tip.x / DESIGN_WIDTH) * 2 - 1, -(tip.y / DESIGN_HEIGHT) * 2 + 1);
  _rayHit.setFromCamera(_ndcHit, camera);
  const hit = _rayHit.intersectObject(mesh, false).length > 0;
  for (let i = 0; i < mats.length; i++) mats[i].side = prev[i];
  return hit;
}

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
    const len = chordLength(clipped.c0, clipped.c1);
    if (len < 1e-4) continue;
    if (!first) first = clipped.c0;
    last = clipped.c1;
    length += len;
  }
  if (!first || !last || length < 1e-4) return null;
  return { c0: first, c1: last, length };
}
