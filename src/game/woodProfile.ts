export type Poly2 = { x: number; y: number };

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
