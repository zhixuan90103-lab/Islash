import * as THREE from 'three';
import {
  cleanConvex,
  inwardDist,
  polyArea,
  type Poly2,
} from './woodProfile';

type EdgeLine = {
  dx: number;
  dy: number;
  nx: number;
  ny: number;
  px: number;
  py: number;
};

export type EdgeBand = {
  chamfer: boolean;
  inner0: Poly2;
  inner1: Poly2;
  orig: number;
};

export type ChamferGap = {
  /** 原顶点下标：从 after 到 through（含），对应内沿 innerA→innerB。 */
  verts: number[];
  innerA: Poly2;
  innerB: Poly2;
};

export type ChamferPlan = {
  back: Poly2[];
  rim: number;
  bands: EdgeBand[];
  gaps: ChamferGap[];
  front: Poly2[];
};

function offsetLines(poly: Poly2[], dist: number): EdgeLine[] {
  const n = poly.length;
  const lines: EdgeLine[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    lines.push({ dx, dy, nx, ny, px: a.x + nx * dist, py: a.y + ny * dist });
  }
  return lines;
}

function minAltitude(poly: Poly2[]): number {
  let minH = Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    let h = 0;
    for (const p of poly) h = Math.max(h, inwardDist(p, a, b));
    minH = Math.min(minH, h);
  }
  return minH;
}

function almostSame(a: Poly2, b: Poly2): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
}

/**
 * 把第 i 条偏移线用其余偏移半平面裁成一段。
 * 锐角尖刺的 miter 会落在别的半平面外，该顶点从内轮廓消失，避免倒角带对穿。
 */
function clipOffsetEdge(
  lines: EdgeLine[],
  i: number,
): { a: Poly2; b: Poly2 } | null {
  const L = lines[i];
  const ox = L.px;
  const oy = L.py;
  let t0 = -1e9;
  let t1 = 1e9;
  for (let j = 0; j < lines.length; j++) {
    if (j === i) continue;
    const M = lines[j];
    const num = M.nx * (ox - M.px) + M.ny * (oy - M.py);
    const den = M.nx * L.dx + M.ny * L.dy;
    if (Math.abs(den) < 1e-12) {
      if (num < -1e-8) return null;
      continue;
    }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  }
  if (t1 - t0 <= 1e-8) return null;
  return {
    a: { x: ox + t0 * L.dx, y: oy + t0 * L.dy },
    b: { x: ox + t1 * L.dx, y: oy + t1 * L.dy },
  };
}

function prismPlan(back: Poly2[]): ChamferPlan {
  const n = back.length;
  return {
    back,
    rim: 0,
    bands: back.map((_, i) => ({
      chamfer: false,
      inner0: back[i],
      inner1: back[(i + 1) % n],
      orig: i,
    })),
    gaps: [],
    front: back,
  };
}

/**
 * 凸包半平面内收（内轮廓一定是简单凸多边形）。
 * 切面仍是原轮廓直边挤出，保持平整。
 */
export function planChamfer(
  profile: Poly2[],
  inset: number,
  depth: number,
): ChamferPlan {
  const back = cleanConvex(profile);
  const d = Math.min(Math.max(0, inset), depth * 0.45);
  if (back.length < 3 || d <= 1e-8) return prismPlan(back);
  if (d >= minAltitude(back) - 1e-6) return prismPlan(back);

  const n = back.length;
  const lines = offsetLines(back, d);
  const live: { i: number; a: Poly2; b: Poly2 }[] = [];
  for (let i = 0; i < n; i++) {
    const seg = clipOffsetEdge(lines, i);
    if (
      seg &&
      Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y) > 1e-5
    ) {
      live.push({ i, a: seg.a, b: seg.b });
    }
  }
  if (live.length < 3) return prismPlan(back);

  const bands: EdgeBand[] = back.map((_, i) => ({
    chamfer: false,
    inner0: back[i],
    inner1: back[(i + 1) % n],
    orig: i,
  }));
  for (const s of live) {
    bands[s.i] = { chamfer: true, inner0: s.a, inner1: s.b, orig: s.i };
  }

  const front: Poly2[] = [];
  const gaps: ChamferGap[] = [];
  for (let k = 0; k < live.length; k++) {
    const s = live[k];
    const t = live[(k + 1) % live.length];
    if (!front.length || !almostSame(front[front.length - 1], s.a)) {
      front.push(s.a);
    }
    if (!almostSame(s.a, s.b)) front.push(s.b);

    const adjacent = t.i === (s.i + 1) % n;
    const mitered = adjacent && almostSame(s.b, t.a);
    if (!mitered) {
      const verts: number[] = [];
      let v = (s.i + 1) % n;
      for (let guard = 0; guard < n; guard++) {
        verts.push(v);
        if (v === t.i) break;
        v = (v + 1) % n;
      }
      if (verts.length) gaps.push({ verts, innerA: s.b, innerB: t.a });
      if (!almostSame(s.b, t.a)) front.push(t.a);
    }
  }
  if (front.length >= 2 && almostSame(front[0], front[front.length - 1])) {
    front.pop();
  }
  if (front.length < 3 || polyArea(front) <= 1e-8) return prismPlan(back);

  return { back, rim: d, bands, gaps, front };
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

export function createWoodSolid(
  profile: Poly2[],
  depth: number,
  inset: number,
): THREE.BufferGeometry | null {
  const plan = planChamfer(profile, inset, depth);
  const { back, rim, bands, gaps, front } = plan;
  if (back.length < 3 || front.length < 3) return null;
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
    const band = bands[i];
    if (rim < 1e-8 || !band.chamfer) {
      const co0 = fv(back[i], zChamfer);
      const co1 = fv(back[j], zChamfer);
      pushTri(pos, nrm, bo0, bo1, co1);
      pushTri(pos, nrm, bo0, co1, co0);
    } else {
      const co0 = fv(back[i], zChamfer);
      const co1 = fv(back[j], zChamfer);
      const fi0 = fv(band.inner0, zFront);
      const fi1 = fv(band.inner1, zFront);
      pushTri(pos, nrm, bo0, bo1, co1);
      pushTri(pos, nrm, bo0, co1, co0);
      pushTri(pos, nrm, co0, co1, fi1);
      pushTri(pos, nrm, co0, fi1, fi0);
    }
  }

  for (const gap of gaps) {
    const ia = fv(gap.innerA, zFront);
    const ib = fv(gap.innerB, zFront);
    const outer = gap.verts.map((vi) => fv(back[vi], zChamfer));
    if (outer.length === 0) continue;
    const pinched = almostSame(gap.innerA, gap.innerB);
    if (pinched) {
      for (let k = 0; k + 1 < outer.length; k++) {
        pushTri(pos, nrm, ia, outer[k], outer[k + 1]);
      }
      continue;
    }
    if (outer.length === 1) {
      pushTri(pos, nrm, outer[0], ia, ib);
      continue;
    }
    pushTri(pos, nrm, ia, ib, outer[outer.length - 1]);
    for (let k = outer.length - 1; k > 0; k--) {
      pushTri(pos, nrm, ia, outer[k], outer[k - 1]);
    }
  }

  if (pos.length < 9) return null;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  geom.userData.profile = back;
  return geom;
}
