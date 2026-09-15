import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../adapt/design';
import { TRAIL } from './design';
import type { DesignPoint } from './slashInput';

type TrailPt = DesignPoint & { t: number };

function dist(a: DesignPoint, b: DesignPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function createSlashOverlay(stage: HTMLElement): {
  canvas: HTMLCanvasElement;
  begin: () => void;
  push: (p: DesignPoint) => void;
  end: () => void;
  step: (now?: number) => void;
  clear: () => void;
} {
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none;';
  stage.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  const pts: TrailPt[] = [];
  let emitting = false;

  const syncSize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(DESIGN_WIDTH * dpr);
    canvas.height = Math.round(DESIGN_HEIGHT * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  syncSize();

  const wipe = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dpr = canvas.width / DESIGN_WIDTH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const drain = (now: number) => {
    const cut = now - TRAIL.life * 1000;
    while (pts.length && pts[0].t < cut) pts.shift();
  };

  const paint = (now: number) => {
    wipe();
    drain(now);
    if (pts.length === 0) return;

    const head = pts[pts.length - 1];
    const lifeMs = TRAIL.life * 1000;
    const widthAt = (p: TrailPt) => {
      const age = Math.max(0, Math.min(1, (now - p.t) / lifeMs));
      const k = 1 - age;
      return TRAIL.tailW + (TRAIL.headW - TRAIL.tailW) * k * k;
    };

    if (pts.length === 1) {
      if (!emitting) return;
      ctx.beginPath();
      ctx.arc(head.x, head.y, TRAIL.headW * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
      return;
    }

    const n = pts.length - 1;
    const left: DesignPoint[] = [];
    const right: DesignPoint[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const dx =
        i === 0
          ? pts[1].x - pts[0].x
          : i === n
            ? pts[n].x - pts[n - 1].x
            : pts[i + 1].x - pts[i - 1].x;
      const dy =
        i === 0
          ? pts[1].y - pts[0].y
          : i === n
            ? pts[n].y - pts[n - 1].y
            : pts[i + 1].y - pts[i - 1].y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const w = widthAt(p);
      left.push({ x: p.x + nx * w, y: p.y + ny * w });
      right.push({ x: p.x - nx * w, y: p.y - ny * w });
    }

    const tailAge = Math.max(0, Math.min(1, (now - pts[0].t) / lifeMs));
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.55 * (1 - tailAge * 0.5)})`;
    ctx.fill();

    if (emitting) {
      ctx.beginPath();
      ctx.arc(head.x, head.y, TRAIL.headW * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
  };

  const begin = () => {
    pts.length = 0;
    emitting = true;
    wipe();
  };

  const push = (p: DesignPoint) => {
    if (!emitting) return;
    const last = pts[pts.length - 1];
    const now = performance.now();
    if (last && dist(last, p) < TRAIL.minDist) {
      last.x = p.x;
      last.y = p.y;
      last.t = now;
      return;
    }
    pts.push({ x: p.x, y: p.y, t: now });
  };

  const end = () => {
    emitting = false;
  };

  const clear = () => {
    pts.length = 0;
    emitting = false;
    wipe();
  };

  const step = (now = performance.now()) => {
    paint(now);
  };

  return { canvas, begin, push, end, step, clear };
}
