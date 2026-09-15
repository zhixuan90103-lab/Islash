import * as THREE from 'three';
import { VIEW, WOOD, bevelInset, woodSize } from './design';
import type { SlashPhysics } from './slashPhysics';

export type Poly2 = { x: number; y: number };

export function prepareCuttable(mesh: THREE.Mesh): void {
  mesh.userData.cuttable = true;
}

export function rectProfile(width: number, height: number): Poly2[] {
  const hw = width * 0.5;
  const hh = height * 0.5;
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
}

function polyArea(poly: Poly2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a * 0.5;
}

export function ensureCcw(poly: Poly2[]): Poly2[] {
  return polyArea(poly) < 0 ? poly.slice().reverse() : poly;
}

function dedupePoly(poly: Poly2[]): Poly2[] {
  const out: Poly2[] = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1e-4) continue;
    out.push(p);
  }
  if (out.length >= 2) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-4) out.pop();
  }
  return out;
}

/** 去掉过短边和共线点，避免切开后出现碎面。 */
function cleanConvex(poly: Poly2[]): Poly2[] {
  let pts = ensureCcw(dedupePoly(poly));
  const minEdge = 1e-3;
  const colinear = 2e-3;
  for (let pass = 0; pass < 8 && pts.length > 3; pass++) {
    const next: Poly2[] = [];
    let dropped = false;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < minEdge) {
        dropped = true;
        continue;
      }
      const ax = p1.x - p0.x;
      const ay = p1.y - p0.y;
      const bx = p2.x - p1.x;
      const by = p2.y - p1.y;
      const cross = ax * by - ay * bx;
      const mag = Math.hypot(ax, ay) * Math.hypot(bx, by);
      if (mag > 1e-12 && Math.abs(cross) < colinear * mag) {
        dropped = true;
        continue;
      }
      next.push(p1);
    }
    if (next.length < 3) break;
    pts = next;
    if (!dropped) break;
  }
  return ensureCcw(pts);
}

/** 凸多边形按直线切开。线为 a→b，叉积>0 为左侧。 */
export function splitConvexPolygon(
  poly: Poly2[],
  a: Poly2,
  b: Poly2,
): { pos: Poly2[]; neg: Poly2[] } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx * dx + dy * dy < 1e-12) return null;
  const dist = (p: Poly2) => (p.x - a.x) * dy - (p.y - a.y) * dx;
  const n = poly.length;
  const sides: number[] = [];
  let anyPos = false;
  let anyNeg = false;
  for (const p of poly) {
    const d = dist(p);
    const s = d > 1e-8 ? 1 : d < -1e-8 ? -1 : 0;
    sides.push(s);
    if (s > 0) anyPos = true;
    if (s < 0) anyNeg = true;
  }
  if (!anyPos || !anyNeg) return null;

  const pos: Poly2[] = [];
  const neg: Poly2[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const pi = poly[i];
    const pj = poly[j];
    const si = sides[i];
    const sj = sides[j];
    if (si >= 0) pos.push(pi);
    if (si <= 0) neg.push(pi);
    if (si * sj === -1) {
      const di = dist(pi);
      const dj = dist(pj);
      const t = di / (di - dj);
      const hit = { x: pi.x + (pj.x - pi.x) * t, y: pi.y + (pj.y - pi.y) * t };
      pos.push(hit);
      neg.push(hit);
    }
  }
  const posC = cleanConvex(pos);
  const negC = cleanConvex(neg);
  if (posC.length < 3 || negC.length < 3) return null;
  if (Math.abs(polyArea(posC)) < 1e-6 || Math.abs(polyArea(negC)) < 1e-6) {
    return null;
  }
  return { pos: posC, neg: negC };
}

type EdgeLine = { px: number; py: number; dx: number; dy: number; nx: number; ny: number };

function inwardDist(p: Poly2, a: Poly2, b: Poly2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return 0;
  return ((p.x - a.x) * -dy + (p.y - a.y) * dx) / len;
}

/** 凸多边形平行内收：邻边内移后求交。不截 miter，避免锐角倒角带扭面。 */
function offsetConvex(poly: Poly2[], dist: number): Poly2[] | null {
  const n = poly.length;
  if (n < 3 || dist <= 1e-8) return null;
  const lines: EdgeLine[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-8) return null;
    const nx = -dy / len;
    const ny = dx / len;
    lines.push({ px: a.x + nx * dist, py: a.y + ny * dist, dx, dy, nx, ny });
  }
  const out: Poly2[] = [];
  for (let i = 0; i < n; i++) {
    const a = lines[(i - 1 + n) % n];
    const b = lines[i];
    const den = a.dx * b.dy - a.dy * b.dx;
    if (Math.abs(den) < 1e-10) return null;
    const t = ((b.px - a.px) * b.dy - (b.py - a.py) * b.dx) / den;
    out.push({ x: a.px + t * a.dx, y: a.py + t * a.dy });
  }
  if (polyArea(out) <= 1e-8) return null;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const odx = out[j].x - out[i].x;
    const ody = out[j].y - out[i].y;
    if (odx * lines[i].dx + ody * lines[i].dy <= 1e-10) return null;
  }
  const slop = dist * 0.02 + 1e-6;
  for (const p of out) {
    for (let i = 0; i < n; i++) {
      if (inwardDist(p, poly[i], poly[(i + 1) % n]) < dist - slop) return null;
    }
  }
  return out;
}

function insetForBevel(
  poly: Poly2[],
  want: number,
): { front: Poly2[]; rim: number } {
  if (want <= 1e-8) return { front: poly, rim: 0 };
  const exact = offsetConvex(poly, want);
  if (exact && exact.length === poly.length) return { front: exact, rim: want };
  let lo = 0;
  let hi = want;
  let best: Poly2[] | null = null;
  let bestD = 0;
  for (let k = 0; k < 16; k++) {
    const mid = (lo + hi) * 0.5;
    const hit = offsetConvex(poly, mid);
    if (hit && hit.length === poly.length) {
      best = hit;
      bestD = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  if (!best || bestD < 1e-5) return { front: poly, rim: 0 };
  return { front: best, rim: bestD };
}

function pushTri(
  pos: number[],
  nrm: number[],
  p: THREE.Vector3,
  q: THREE.Vector3,
  r: THREE.Vector3,
): void {
  const cx = (q.y - p.y) * (r.z - p.z) - (q.z - p.z) * (r.y - p.y);
  const cy = (q.z - p.z) * (r.x - p.x) - (q.x - p.x) * (r.z - p.z);
  const cz = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const len = Math.hypot(cx, cy, cz);
  if (len < 1e-16) return;
  const nx = cx / len;
  const ny = cy / len;
  const nz = cz / len;
  pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
  nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
}

/**
 * 竖直挤出 + 正面等宽倒角。名字历史遗留，不是锥台。
 * 侧面不斜；每条轮廓边（含新切边）同一圈窄棱。规范：docs/SLASH-DESIGN.md 几何。
 */
export function createFrustumGeometry(
  profile: Poly2[],
  depth: number,
  inset: number,
): THREE.BufferGeometry | null {
  const back = cleanConvex(profile);
  if (back.length < 3) return null;
  const want = Math.min(Math.max(0, inset), depth * 0.45);
  const { front, rim } = insetForBevel(back, want);
  const hd = depth * 0.5;
  const zBack = -hd;
  const zFront = hd;
  const zChamfer = hd - rim;
  const pos: number[] = [];
  const nrm: number[] = [];
  const fv = (p: Poly2, z: number) => new THREE.Vector3(p.x, p.y, z);

  const f0 = fv(front[0], zFront);
  const b0 = fv(back[0], zBack);
  for (let i = 1; i + 1 < front.length; i++) {
    pushTri(pos, nrm, f0, fv(front[i], zFront), fv(front[i + 1], zFront));
  }
  for (let i = 1; i + 1 < back.length; i++) {
    pushTri(pos, nrm, b0, fv(back[i + 1], zBack), fv(back[i], zBack));
  }
  for (let i = 0; i < back.length; i++) {
    const j = (i + 1) % back.length;
    const bo0 = fv(back[i], zBack);
    const bo1 = fv(back[j], zBack);
    if (rim < 1e-8 || front.length !== back.length) {
      const fo0 = fv(back[i], zFront);
      const fo1 = fv(back[j], zFront);
      pushTri(pos, nrm, bo0, bo1, fo1);
      pushTri(pos, nrm, bo0, fo1, fo0);
      continue;
    }
    const co0 = fv(back[i], zChamfer);
    const co1 = fv(back[j], zChamfer);
    const fi0 = fv(front[i], zFront);
    const fi1 = fv(front[j], zFront);
    pushTri(pos, nrm, bo0, bo1, co1);
    pushTri(pos, nrm, bo0, co1, co0);
    pushTri(pos, nrm, co0, co1, fi1);
    pushTri(pos, nrm, co0, fi1, fi0);
  }
  if (pos.length < 9) return null;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  return geom;
}

export function createWoodGeometry(
  width: number,
  height: number,
  depth: number,
): THREE.BufferGeometry {
  const geom = createFrustumGeometry(
    rectProfile(width, height),
    depth,
    bevelInset(depth),
  );
  if (!geom) {
    return new THREE.BoxGeometry(width, height, depth);
  }
  return geom;
}

export function meshFromProfile(
  profile: Poly2[],
  depth: number,
  source: THREE.Mesh,
): THREE.Mesh | null {
  const geom = createFrustumGeometry(profile, depth, bevelInset(depth));
  if (!geom) return null;
  const srcMat = source.material;
  const mat = Array.isArray(srcMat)
    ? srcMat[0].clone()
    : (srcMat as THREE.Material).clone();
  const m = new THREE.Mesh(geom, mat);
  m.position.copy(source.position);
  m.quaternion.copy(source.quaternion);
  m.scale.copy(source.scale);
  m.userData.cuttable = true;
  m.userData.profile = profile;
  m.userData.depth = depth;
  return m;
}

export type WoodSet = {
  cuttables: THREE.Mesh[];
  spawn: () => void;
  forget: (mesh: THREE.Mesh) => void;
  track: (mesh: THREE.Mesh) => void;
  dispose: () => void;
};

export function createWoodSet(
  scene: THREE.Scene,
  physics: SlashPhysics,
): WoodSet {
  const cuttables: THREE.Mesh[] = [];
  const spawned: THREE.Mesh[] = [];
  const mat = new THREE.MeshStandardMaterial({
    color: VIEW.woodColor,
    metalness: 0.04,
    roughness: 0.62,
    flatShading: true,
  });

  const forget = (mesh: THREE.Mesh) => {
    const i = cuttables.indexOf(mesh);
    if (i >= 0) cuttables.splice(i, 1);
    const si = spawned.indexOf(mesh);
    if (si >= 0) spawned.splice(si, 1);
  };

  const track = (mesh: THREE.Mesh) => {
    spawned.push(mesh);
  };

  const spawn = () => {
    for (const m of spawned) {
      physics.removeMesh(m);
      scene.remove(m);
      m.geometry.dispose();
    }
    spawned.length = 0;
    cuttables.length = 0;

    const size = woodSize();
    const mesh = new THREE.Mesh(
      createWoodGeometry(size.width, size.height, size.depth),
      mat,
    );
    mesh.position.set(0, WOOD.lift, 0);
    mesh.userData.profile = rectProfile(size.width, size.height);
    mesh.userData.depth = size.depth;
    scene.add(mesh);
    prepareCuttable(mesh);
    physics.addMesh(mesh, 'staticBox');
    cuttables.push(mesh);
    spawned.push(mesh);
  };

  return {
    cuttables,
    spawn,
    forget,
    track,
    dispose: () => {
      for (const m of spawned) {
        physics.removeMesh(m);
        scene.remove(m);
        m.geometry.dispose();
      }
      spawned.length = 0;
      cuttables.length = 0;
      mat.dispose();
    },
  };
}
