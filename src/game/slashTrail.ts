/**
 * 手指划痕：时间制丝带。
 * 可见段 = 最近 TRAIL.life 秒的触点路径，再钳 TRAIL.maxLen。
 * 与切开判定无关；触点来自 onTip，不走 INTERP_GAP。
 */
import { TRAIL } from './design';
import type { DesignPoint } from './slashInput';

type Knot = { x: number; y: number; t: number };

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function lerpPt(a: DesignPoint, b: DesignPoint, t: number): DesignPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function crTime(ti: number, a: DesignPoint, b: DesignPoint): number {
  return ti + Math.sqrt(Math.max(dist(a, b), 1e-4));
}

function crSegment(
  p0: DesignPoint,
  p1: DesignPoint,
  p2: DesignPoint,
  p3: DesignPoint,
  t: number,
): DesignPoint {
  const t0 = 0;
  const t1 = crTime(t0, p0, p1);
  const t2 = crTime(t1, p1, p2);
  const t3 = crTime(t2, p2, p3);
  const u = t1 + t * (t2 - t1);
  const a1 = lerpPt(p0, p1, (u - t0) / (t1 - t0 || 1));
  const a2 = lerpPt(p1, p2, (u - t1) / (t2 - t1 || 1));
  const a3 = lerpPt(p2, p3, (u - t2) / (t3 - t2 || 1));
  const b1 = lerpPt(a1, a2, (u - t0) / (t2 - t0 || 1));
  const b2 = lerpPt(a2, a3, (u - t1) / (t3 - t1 || 1));
  return lerpPt(b1, b2, (u - t1) / (t2 - t1 || 1));
}

function splineRibbon(pts: DesignPoint[], subdiv: number): DesignPoint[] {
  const steps = Math.max(1, Math.round(subdiv));
  if (pts.length < 3 || steps <= 1) return pts;
  const last = pts.length - 1;
  const out: DesignPoint[] = [];
  for (let i = 0; i < last; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(last, i + 2)];
    const start = i === 0 ? 0 : 1;
    for (let s = start; s <= steps; s++) {
      out.push(crSegment(p0, p1, p2, p3, s / steps));
    }
  }
  return out;
}

function resampleArc(pts: DesignPoint[], spacing: number): DesignPoint[] {
  if (pts.length < 2) return pts.map((p) => ({ x: p.x, y: p.y }));
  const gap = Math.max(2, spacing);
  const out: DesignPoint[] = [{ x: pts[0].x, y: pts[0].y }];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    let ax = out[out.length - 1].x;
    let ay = out[out.length - 1].y;
    const bx = pts[i].x;
    const by = pts[i].y;
    let dx = bx - ax;
    let dy = by - ay;
    let seg = Math.hypot(dx, dy);
    if (seg < 1e-6) continue;
    while (carry + seg >= gap) {
      const t = (gap - carry) / seg;
      ax += dx * t;
      ay += dy * t;
      out.push({ x: ax, y: ay });
      dx = bx - ax;
      dy = by - ay;
      seg = Math.hypot(dx, dy);
      carry = 0;
      if (seg < 1e-6) break;
    }
    carry += seg;
  }
  const tip = pts[pts.length - 1];
  const last = out[out.length - 1];
  if (dist(last, tip) > 0.4) out.push({ x: tip.x, y: tip.y });
  else {
    last.x = tip.x;
    last.y = tip.y;
  }
  return out;
}

function roundInterior(pts: DesignPoint[], passes: number): DesignPoint[] {
  if (pts.length < 3 || passes <= 0) {
    return pts.map((p) => ({ x: p.x, y: p.y }));
  }
  let cur = pts.map((p) => ({ x: p.x, y: p.y }));
  for (let n = 0; n < passes; n++) {
    const next = cur.map((p) => ({ x: p.x, y: p.y }));
    for (let i = 1; i < cur.length - 1; i++) {
      next[i].x = cur[i].x * 0.5 + (cur[i - 1].x + cur[i + 1].x) * 0.25;
      next[i].y = cur[i].y * 0.5 + (cur[i - 1].y + cur[i + 1].y) * 0.25;
    }
    cur = next;
  }
  cur[0] = { x: pts[0].x, y: pts[0].y };
  cur[cur.length - 1] = {
    x: pts[pts.length - 1].x,
    y: pts[pts.length - 1].y,
  };
  return cur;
}

/** 从刀尖往回：丢掉过期点，再钳 maxLen。 */
function windowKnots(knots: Knot[], now: number): DesignPoint[] {
  const lifeMs = Math.max(0.04, TRAIL.life) * 1000;
  const cap = Math.max(8, TRAIL.maxLen);
  const born = now - lifeMs;
  const live: Knot[] = [];
  for (const k of knots) {
    if (k.t >= born) live.push(k);
  }
  if (live.length === 0) return [];

  const out: DesignPoint[] = [];
  let acc = 0;
  const last = live.length - 1;
  out.push({ x: live[last].x, y: live[last].y });
  for (let i = last; i > 0; i--) {
    const d = dist(live[i], live[i - 1]);
    if (acc + d >= cap) {
      const t = (cap - acc) / (d || 1);
      out.push({
        x: live[i].x + (live[i - 1].x - live[i].x) * t,
        y: live[i].y + (live[i - 1].y - live[i].y) * t,
      });
      break;
    }
    acc += d;
    out.push({ x: live[i - 1].x, y: live[i - 1].y });
  }
  out.reverse();
  return out;
}

export function createFingerTrail(): {
  begin: () => void;
  push: (p: DesignPoint, now?: number) => void;
  end: () => void;
  clear: () => void;
  setPredicted: (points: DesignPoint[]) => void;
  paint: (ctx: CanvasRenderingContext2D, now: number) => void;
} {
  const knots: Knot[] = [];
  let emitting = false;
  let filt: DesignPoint | null = null;
  let lastT = 0;
  let predicted: DesignPoint[] = [];

  const begin = () => {
    knots.length = 0;
    emitting = true;
    filt = null;
    lastT = 0;
    predicted = [];
  };

  const end = () => {
    emitting = false;
  };

  const clear = () => {
    knots.length = 0;
    emitting = false;
    filt = null;
    lastT = 0;
    predicted = [];
  };

  const push = (p: DesignPoint, now = performance.now()) => {
    if (!emitting) return;
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0;
    let q = p;
    if (TRAIL.smooth > 0.0005) {
      if (!filt) filt = { x: p.x, y: p.y };
      else if (dist(filt, p) <= Math.max(2, TRAIL.minDist)) {
        const a = 1 - Math.exp(-Math.max(dt, 0.004) / TRAIL.smooth);
        filt = {
          x: filt.x + (p.x - filt.x) * a,
          y: filt.y + (p.y - filt.y) * a,
        };
      } else {
        filt = { x: p.x, y: p.y };
      }
      q = filt;
    } else {
      filt = { x: p.x, y: p.y };
    }
    lastT = now;

    const gap = Math.max(2, TRAIL.minDist);
    if (knots.length === 0) {
      knots.push({ x: q.x, y: q.y, t: now });
      return;
    }

    if (knots.length === 1) {
      if (dist(knots[0], q) >= 1) {
        knots.push({ x: q.x, y: q.y, t: now });
      } else {
        knots[0].x = q.x;
        knots[0].y = q.y;
        knots[0].t = now;
      }
      return;
    }

    const head = knots[knots.length - 1];
    head.x = q.x;
    head.y = q.y;
    head.t = now;
    const knot = knots[knots.length - 2];
    if (dist(knot, head) >= gap) {
      knots.splice(knots.length - 1, 0, {
        x: head.x,
        y: head.y,
        t: now,
      });
    }

    const lifeMs = Math.max(0.04, TRAIL.life) * 1000;
    const born = now - lifeMs;
    while (knots.length > 2 && knots[0].t < born) knots.shift();
  };

  const paint = (ctx: CanvasRenderingContext2D, now: number) => {
    if (!TRAIL.show) return;

    const raw = windowKnots(knots, now);
    if (raw.length === 0) {
      if (emitting && filt) {
        ctx.beginPath();
        ctx.arc(filt.x, filt.y, TRAIL.headW * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fill();
      }
      return;
    }

    /**
     * 慢划：路径短，仍画刀尖圆 + 能有的那截丝带。
     * 快划：life 窗口里很长，再被 maxLen 钳住。
     */
    if (raw.length === 1 || (raw.length === 2 && dist(raw[0], raw[1]) < 2.5)) {
      const head = raw[raw.length - 1];
      ctx.beginPath();
      ctx.arc(head.x, head.y, TRAIL.headW * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
      if (raw.length < 2) return;
    }

    const drawPts = roundInterior(resampleArc(raw, 8), 2);
    const ribbon = splineRibbon(
      drawPts,
      drawPts.length < 3 ? 1 : TRAIL.subdiv,
    );
    if (ribbon.length < 2) return;

    const distFromHead: number[] = new Array(ribbon.length);
    distFromHead[ribbon.length - 1] = 0;
    let span = 0;
    for (let i = ribbon.length - 2; i >= 0; i--) {
      distFromHead[i] = distFromHead[i + 1] + dist(ribbon[i], ribbon[i + 1]);
      span = distFromHead[i];
    }
    span = Math.max(span, 1);
    const widthAt = (i: number) => {
      const k = Math.max(0, Math.min(1, 1 - distFromHead[i] / span));
      return TRAIL.tailW + (TRAIL.headW - TRAIL.tailW) * k * k;
    };

    const head = ribbon[ribbon.length - 1];
    const n = ribbon.length - 1;
    const left: DesignPoint[] = [];
    const right: DesignPoint[] = [];
    for (let i = 0; i < ribbon.length; i++) {
      const p = ribbon[i];
      let tx: number;
      let ty: number;
      if (i === 0) {
        tx = ribbon[1].x - ribbon[0].x;
        ty = ribbon[1].y - ribbon[0].y;
      } else if (i === n) {
        tx = ribbon[n].x - ribbon[n - 1].x;
        ty = ribbon[n].y - ribbon[n - 1].y;
      } else {
        const ix = ribbon[i].x - ribbon[i - 1].x;
        const iy = ribbon[i].y - ribbon[i - 1].y;
        const ox = ribbon[i + 1].x - ribbon[i].x;
        const oy = ribbon[i + 1].y - ribbon[i].y;
        const il = Math.hypot(ix, iy) || 1;
        const ol = Math.hypot(ox, oy) || 1;
        tx = ix / il + ox / ol;
        ty = iy / il + oy / ol;
      }
      const len = Math.hypot(tx, ty) || 1;
      const nx = -ty / len;
      const ny = tx / len;
      const w = widthAt(i);
      left.push({ x: p.x + nx * w, y: p.y + ny * w });
      right.push({ x: p.x - nx * w, y: p.y - ny * w });
    }

    const tdx = ribbon[n].x - ribbon[n - 1].x;
    const tdy = ribbon[n].y - ribbon[n - 1].y;
    const tlen = Math.hypot(tdx, tdy) || 1;
    const tip = {
      x: head.x + (tdx / tlen) * TRAIL.tipLen,
      y: head.y + (tdy / tlen) * TRAIL.tipLen,
    };

    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
    ctx.lineTo(tip.x, tip.y);
    for (let i = right.length - 1; i >= 0; i--) {
      ctx.lineTo(right[i].x, right[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fill();

    if (predicted.length > 0 && TRAIL.predictAlpha > 0.01) {
      ctx.beginPath();
      ctx.moveTo(head.x, head.y);
      for (const p of predicted) ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = `rgba(255,255,255,${TRAIL.predictAlpha})`;
      ctx.lineWidth = Math.max(1, TRAIL.headW * 0.35);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  };

  return {
    begin,
    push,
    end,
    clear,
    paint,
    setPredicted(points: DesignPoint[]) {
      predicted = points;
    },
  };
}
