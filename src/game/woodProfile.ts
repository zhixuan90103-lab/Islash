export type Poly2 = { x: number; y: number };

function polyBBox(poly: Poly2[]): { w: number; h: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    w: Math.max(1e-6, maxX - minX),
    h: Math.max(1e-6, maxY - minY),
  };
}

function centerPoly(poly: Poly2[]): Poly2[] {
  let sx = 0;
  let sy = 0;
  for (const p of poly) {
    sx += p.x;
    sy += p.y;
  }
  const n = Math.max(1, poly.length);
  const cx = sx / n;
  const cy = sy / n;
  return poly.map((p) => ({ x: p.x - cx, y: p.y - cy }));
}

/** 先对齐目标面积，再必要时等比缩小以落入画面。 */
export function matchBoardArea(
  poly: Poly2[],
  targetArea: number,
  maxW: number,
  maxH: number,
): Poly2[] {
  let out = centerPoly(ensureCcw(poly));
  const a = Math.abs(polyArea(out));
  const want = Math.abs(targetArea);
  const s0 = Math.sqrt(want / Math.max(a, 1e-12));
  out = out.map((p) => ({ x: p.x * s0, y: p.y * s0 }));
  const box = polyBBox(out);
  const fit = Math.min(1, maxW / box.w, maxH / box.h);
  if (fit < 0.999) out = out.map((p) => ({ x: p.x * fit, y: p.y * fit }));
  return out;
}

function regularPoly(n: number, rx: number, ry: number, rot = -Math.PI / 2): Poly2[] {
  const pts: Poly2[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    pts.push({ x: Math.cos(a) * rx, y: Math.sin(a) * ry });
  }
  return pts;
}

/** 六边菱形：上下尖很短，中间左右两条竖边更长。 */
function hexDiamondProfile(): Poly2[] {
  const hw = 0.32 * 1.3;
  const tip = 1.04 * 1.3;
  const mid = 0.78 * 1.3;
  return [
    { x: 0, y: tip },
    { x: -hw, y: mid },
    { x: -hw, y: -mid },
    { x: 0, y: -tip },
    { x: hw, y: -mid },
    { x: hw, y: mid },
  ];
}

/**
 * 当前图库：长六边、圆。面积在 spawn 时对齐。
 */
const BOARD_SHAPES: { make: () => Poly2[]; matchArea: boolean; areaScale: number }[] = [
  { make: () => hexDiamondProfile(), matchArea: false, areaScale: 1 },
  { make: () => regularPoly(48, 1.05, 1.05), matchArea: true, areaScale: 0.81 * 0.81 },
  { make: () => rectProfile(1.4, 1.4), matchArea: true, areaScale: 0.8 * 0.8 },
];

export function catalogBoardProfile(
  targetArea: number,
  maxW: number,
  maxH: number,
  last = -1,
): { profile: Poly2[]; index: number } {
  const n = BOARD_SHAPES.length;
  const index = n > 0 ? (last + 1 + n) % n : 0;
  const spec = BOARD_SHAPES[index];
  const raw = spec.make();
  const area = spec.matchArea
    ? targetArea * spec.areaScale
    : Math.abs(polyArea(raw));
  const profile = matchBoardArea(raw, area, maxW, maxH);
  return { profile, index };
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

export function polyArea(poly: Poly2[]): number {
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

function cross2(a: Poly2, b: Poly2, c: Poly2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

export function polyIsConvex(poly: Poly2[]): boolean {
  const n = poly.length;
  if (n < 3) return false;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const cr = cross2(poly[i], poly[(i + 1) % n], poly[(i + 2) % n]);
    if (Math.abs(cr) < 1e-12) continue;
    const s = cr > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

function pointInTri(p: Poly2, a: Poly2, b: Poly2, c: Poly2): boolean {
  const c0 = cross2(a, b, p);
  const c1 = cross2(b, c, p);
  const c2 = cross2(c, a, p);
  return c0 >= -1e-10 && c1 >= -1e-10 && c2 >= -1e-10;
}

/** 耳切。多边形须 CCW、简单。凹形（星、伞）正面不能用扇形。 */
export function earClip(poly: Poly2[]): [number, number, number][] {
  const n0 = poly.length;
  if (n0 < 3) return [];
  if (n0 === 3) return [[0, 1, 2]];
  const idx: number[] = [];
  for (let i = 0; i < n0; i++) idx.push(i);
  const tris: [number, number, number][] = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < n0 * n0) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i - 1 + idx.length) % idx.length];
      const i1 = idx[i];
      const i2 = idx[(i + 1) % idx.length];
      if (cross2(poly[i0], poly[i1], poly[i2]) <= 1e-12) continue;
      let ear = true;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        if (pointInTri(poly[j], poly[i0], poly[i1], poly[i2])) {
          ear = false;
          break;
        }
      }
      if (!ear) continue;
      tris.push([i0, i1, i2]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
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

/** 轮廓清理：过短边 / 共线点。切开后的真源必须经过这里。 */
export function cleanConvex(poly: Poly2[], minEdge = 1e-3): Poly2[] {
  let pts = ensureCcw(dedupePoly(poly));
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

export function inwardDist(p: Poly2, a: Poly2, b: Poly2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return 0;
  return ((p.x - a.x) * -dy + (p.y - a.y) * dx) / len;
}

export function pointInConvex(p: Poly2, poly: Poly2[], slop = 1e-4): boolean {
  for (let i = 0; i < poly.length; i++) {
    if (inwardDist(p, poly[i], poly[(i + 1) % poly.length]) < -slop) return false;
  }
  return true;
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
