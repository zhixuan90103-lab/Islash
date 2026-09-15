import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../adapt/design';
import { FLASH, INTENT, TRAIL } from './design';
import type { DesignPoint } from './slashInput';

export type IntentDebug = {
  geom: { c0: DesignPoint; c1: DesignPoint } | null;
  locked: { c0: DesignPoint; c1: DesignPoint } | null;
  commit: { c0: DesignPoint; c1: DesignPoint } | null;
  stable: number;
  lockedFlag: boolean;
};

type TrailPt = DesignPoint & { t: number };

function dist(a: DesignPoint, b: DesignPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

type FlashSeg = { c0: DesignPoint; c1: DesignPoint; born: number; preview: boolean };

function extendChord(
  c0: DesignPoint,
  c1: DesignPoint,
): [DesignPoint, DesignPoint] {
  const dx = c1.x - c0.x;
  const dy = c1.y - c0.y;
  const len = Math.hypot(dx, dy) || 1;
  const extra = FLASH.overshoot + FLASH.overshootRatio * len;
  const ux = dx / len;
  const uy = dy / len;
  return [
    { x: c0.x - ux * extra, y: c0.y - uy * extra },
    { x: c1.x + ux * extra, y: c1.y + uy * extra },
  ];
}

function paintSpindle(
  ctx: CanvasRenderingContext2D,
  a: DesignPoint,
  b: DesignPoint,
  halfW: number,
  fill: string,
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const nx = -dy / len;
  const ny = dx / len;
  const steps = 12;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = Math.sin(Math.PI * t) * halfW;
    const x = a.x + dx * t + nx * w;
    const y = a.y + dy * t + ny * w;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const w = Math.sin(Math.PI * t) * halfW;
    ctx.lineTo(a.x + dx * t - nx * w, a.y + dy * t - ny * w);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

export function createSlashOverlay(stage: HTMLElement): {
  canvas: HTMLCanvasElement;
  begin: () => void;
  push: (p: DesignPoint) => void;
  setPreview: (c0: DesignPoint | null, c1?: DesignPoint) => void;
  setPredicted: (points: DesignPoint[]) => void;
  setIntentDebug: (info: IntentDebug | null) => void;
  flash: (c0: DesignPoint, c1: DesignPoint) => void;
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
  const flashes: FlashSeg[] = [];
  let preview: { c0: DesignPoint; c1: DesignPoint } | null = null;
  let predicted: DesignPoint[] = [];
  let intentDebug: IntentDebug | null = null;
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

    const trailLifeMs = TRAIL.life * 1000;
    const widthAt = (p: TrailPt) => {
      const age = Math.max(0, Math.min(1, (now - p.t) / trailLifeMs));
      const k = 1 - age;
      return TRAIL.tailW + (TRAIL.headW - TRAIL.tailW) * k * k;
    };

    if (pts.length === 1 && emitting) {
      const head = pts[0];
      ctx.beginPath();
      ctx.arc(head.x, head.y, TRAIL.headW * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
    } else if (pts.length >= 2) {
      const head = pts[pts.length - 1];
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

      const tailAge = Math.max(0, Math.min(1, (now - pts[0].t) / trailLifeMs));
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

      if (predicted.length > 0) {
        ctx.beginPath();
        ctx.moveTo(head.x, head.y);
        for (const p of predicted) ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = Math.max(1, TRAIL.headW * 0.35);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    }

    const flashLifeMs = FLASH.life * 1000;
    const dpr = canvas.width / DESIGN_WIDTH;
    const drawFlash = (c0: DesignPoint, c1: DesignPoint, alpha: number) => {
      if (alpha <= 0.01) return;
      const [a, b] = extendChord(c0, c1);
      ctx.save();
      ctx.shadowColor = `rgba(210, 235, 255, ${0.9 * alpha})`;
      ctx.shadowBlur = FLASH.glowW * dpr;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      paintSpindle(ctx, a, b, FLASH.coreW, `rgba(255, 255, 255, ${0.92 * alpha})`);
      ctx.restore();
    };

    if (preview) {
      ctx.save();
      ctx.strokeStyle = 'rgba(50, 28, 12, 0.55)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(preview.c0.x, preview.c0.y);
      ctx.lineTo(preview.c1.x, preview.c1.y);
      ctx.stroke();
      ctx.restore();
      drawFlash(preview.c0, preview.c1, FLASH.previewAlpha);
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      const k = 1 - (now - f.born) / flashLifeMs;
      if (k <= 0) {
        flashes.splice(i, 1);
        continue;
      }
      drawFlash(f.c0, f.c1, k * k);
    }

    if (INTENT.debug) {
      const strokeChord = (
        chord: { c0: DesignPoint; c1: DesignPoint },
        color: string,
        dash: boolean,
      ) => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.setLineDash(dash ? [6, 4] : []);
        ctx.beginPath();
        ctx.moveTo(chord.c0.x, chord.c0.y);
        ctx.lineTo(chord.c1.x, chord.c1.y);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(chord.c0.x, chord.c0.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(chord.c1.x, chord.c1.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };
      if (intentDebug?.geom) {
        strokeChord(intentDebug.geom, 'rgba(80, 220, 255, 0.9)', true);
      }
      if (intentDebug?.commit) {
        strokeChord(intentDebug.commit, 'rgba(255, 210, 40, 0.95)', false);
      }
      if (intentDebug?.locked) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 80, 200, 1)';
        ctx.lineWidth = 5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(intentDebug.locked.c0.x, intentDebug.locked.c0.y);
        ctx.lineTo(intentDebug.locked.c1.x, intentDebug.locked.c1.y);
        ctx.stroke();
        ctx.restore();
        strokeChord(intentDebug.locked, 'rgba(255, 160, 230, 1)', false);
      }
      ctx.save();
      ctx.font = '13px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      const lockTxt = intentDebug?.lockedFlag
        ? '锁定中 ← 应见粉线'
        : intentDebug?.locked && intentDebug.commit
          ? '已切开（粉=锁定弦 黄=真缝）'
          : '未锁定（先停在板内）';
      const stable = intentDebug?.stable ?? 0;
      ctx.fillText(`intent ${lockTxt}  ${stable}/${INTENT.lockSegs}`, 10, 22);
      ctx.fillStyle = 'rgba(80, 220, 255, 0.9)';
      ctx.fillText('青=外推', 10, 38);
      ctx.fillStyle = 'rgba(255, 80, 200, 0.95)';
      ctx.fillText('粉=锁定', 70, 38);
      ctx.fillStyle = 'rgba(255, 210, 40, 0.95)';
      ctx.fillText('黄=切开', 130, 38);
      ctx.restore();
    }
  };

  const begin = () => {
    pts.length = 0;
    preview = null;
    predicted = [];
    intentDebug = null;
    emitting = true;
    wipe();
  };

  const setPreview = (c0: DesignPoint | null, c1?: DesignPoint) => {
    preview = c0 && c1 ? { c0, c1 } : null;
  };

  const setPredicted = (points: DesignPoint[]) => {
    predicted = points;
  };

  const setIntentDebug = (info: IntentDebug | null) => {
    intentDebug = info;
  };

  const flash = (c0: DesignPoint, c1: DesignPoint) => {
    preview = null;
    flashes.push({ c0, c1, born: performance.now(), preview: false });
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
    preview = null;
    predicted = [];
  };

  const clear = () => {
    pts.length = 0;
    flashes.length = 0;
    preview = null;
    predicted = [];
    intentDebug = null;
    emitting = false;
    wipe();
  };

  const step = (now = performance.now()) => {
    paint(now);
  };

  return {
    canvas,
    begin,
    push,
    setPreview,
    setPredicted,
    setIntentDebug,
    flash,
    end,
    step,
    clear,
  };
}
