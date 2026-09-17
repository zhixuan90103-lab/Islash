import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../adapt/design';
import { FINALE, FLASH, FX, INTENT } from './design';
import type { DesignPoint } from './slashInput';
import { createFingerTrail } from './slashTrail';

export type IntentDebug = {
  geom: { c0: DesignPoint; c1: DesignPoint } | null;
  locked: { c0: DesignPoint; c1: DesignPoint } | null;
  commit: { c0: DesignPoint; c1: DesignPoint } | null;
  stable: number;
  lockedFlag: boolean;
};

type Chip = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  rot: number;
  vr: number;
};

function lerpPt(a: DesignPoint, b: DesignPoint, t: number): DesignPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

type FlashSeg = {
  c0: DesignPoint;
  c1: DesignPoint;
  born: number;
  follow: boolean;
  finale?: boolean;
};

/** 方向跟夹缝，长度拉到 spanMin 再甩出出端。 */
function flashAxis(
  c0: DesignPoint,
  c1: DesignPoint,
  finale = false,
): [DesignPoint, DesignPoint] {
  const dx = c1.x - c0.x;
  const dy = c1.y - c0.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  if (finale) {
    const mid = { x: (c0.x + c1.x) * 0.5, y: (c0.y + c1.y) * 0.5 };
    const half = Math.max(len * 0.5, FINALE.bladeSpan * 0.5);
    return [
      { x: mid.x - ux * half, y: mid.y - uy * half },
      { x: mid.x + ux * half, y: mid.y + uy * half },
    ];
  }
  const span =
    Math.max(len, FLASH.spanMin) * (1 + FLASH.overshootRatio) + FLASH.overshoot;
  const back = FLASH.overshootBack;
  return [
    { x: c0.x - ux * back, y: c0.y - uy * back },
    { x: c0.x + ux * span, y: c0.y + uy * span },
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
  if (len < 0.5) return;
  const nx = -dy / len;
  const ny = dx / len;
  const steps = 14;
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
  setCrack: (c0: DesignPoint | null, c1?: DesignPoint) => void;
  setPredicted: (points: DesignPoint[]) => void;
  setIntentDebug: (info: IntentDebug | null) => void;
  flash: (c0: DesignPoint, c1: DesignPoint, follow?: boolean) => void;
  finaleFlash: (c0: DesignPoint, c1: DesignPoint) => void;
  freezeFlash: () => void;
  burstChips: (c0: DesignPoint, c1: DesignPoint, hit: number) => void;
  impactFlash: (hit: number) => void;
  end: () => void;
  step: (now?: number) => void;
  clear: () => void;
} {
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none;';
  stage.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  const trail = createFingerTrail();
  const flashes: FlashSeg[] = [];
  let crack: { c0: DesignPoint; c1: DesignPoint } | null = null;
  let intentDebug: IntentDebug | null = null;
  let lastPaint = 0;
  const chips: Chip[] = [];
  let flashLeft = 0;
  let flashPeak = 0.035;
  let frameDt = 0;

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

  const tick = (now: number) => {
    const dt = lastPaint ? Math.min(0.05, (now - lastPaint) / 1000) : 0;
    frameDt = dt;
    lastPaint = now;
  };

  const paint = (now: number) => {
    wipe();
    tick(now);

    const dpr = canvas.width / DESIGN_WIDTH;

    if (crack) {
      const dx = crack.c1.x - crack.c0.x;
      const dy = crack.c1.y - crack.c0.y;
      const len = Math.hypot(dx, dy);
      if (len >= 1) {
        const nx = -dy / len;
        const ny = dx / len;
        const startW = Math.min(
          FLASH.crackWMax,
          FLASH.crackW0 + len * FLASH.crackGrow,
        );
        const w0 = startW * 0.5;
        const w1 = FLASH.crackW * 0.5;
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(18, 8, 4, 0.55)';
        ctx.beginPath();
        ctx.moveTo(crack.c0.x + nx * w0, crack.c0.y + ny * w0);
        ctx.lineTo(crack.c1.x + nx * w1, crack.c1.y + ny * w1);
        ctx.lineTo(crack.c1.x - nx * w1, crack.c1.y - ny * w1);
        ctx.lineTo(crack.c0.x - nx * w0, crack.c0.y - ny * w0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    const drawFlash = (
      c0: DesignPoint,
      c1: DesignPoint,
      age: number,
      finale = false,
    ) => {
      if (!FLASH.show || age <= 0 || age >= 1) return;
      const [a, b] = flashAxis(c0, c1, finale);
      const grow = Math.max(0.12, Math.min(0.85, FLASH.grow));
      let lenT = 1;
      let fade = 1;
      if (age < grow) {
        const t = age / grow;
        const e = 1 - (1 - t) * (1 - t);
        const start = Math.max(0.04, Math.min(0.9, FLASH.growStart));
        lenT = start + (1 - start) * e;
      } else {
        const t = (age - grow) / Math.max(0.08, 1 - grow);
        fade = (1 - t) * (1 - t);
      }
      const scale = finale ? FINALE.bladeScale : 1;
      const halfW =
        (FLASH.coreW * (1 - lenT) + FLASH.coreWMin * lenT) * fade * scale;
      if (halfW < 0.08 || fade < 0.03) return;
      const tail = finale
        ? lerpPt({ x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 }, a, lenT)
        : lerpPt(a, b, 0);
      const head = finale
        ? lerpPt({ x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 }, b, lenT)
        : lerpPt(a, b, Math.max(0.06, lenT));
      ctx.save();
      ctx.shadowColor = `rgba(210, 235, 255, ${0.85 * fade})`;
      ctx.shadowBlur =
        FLASH.glowW *
        (finale ? FINALE.glowScale : 1) *
        dpr *
        Math.max(0.2, fade);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      paintSpindle(
        ctx,
        tail,
        head,
        halfW,
        `rgba(255, 255, 255, ${0.94 * fade})`,
      );
      ctx.restore();
    };

    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      const lifeMs = (f.finale ? FINALE.bladeLife : FLASH.life) * 1000;
      const age = (now - f.born) / lifeMs;
      if (age >= 1) {
        flashes.splice(i, 1);
        continue;
      }
      const c0 = f.follow && crack ? crack.c0 : f.c0;
      const c1 = f.follow && crack ? crack.c1 : f.c1;
      drawFlash(c0, c1, age, !!f.finale);
    }

    trail.paint(ctx, now);

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

    if (FX.chips && chips.length) {
      const g = 980;
      for (let i = chips.length - 1; i >= 0; i--) {
        const c = chips[i];
        c.life -= frameDt;
        if (c.life <= 0) {
          chips.splice(i, 1);
          continue;
        }
        c.vy += g * frameDt;
        c.x += c.vx * frameDt;
        c.y += c.vy * frameDt;
        c.rot += c.vr * frameDt;
        const a = Math.max(0, c.life / c.max);
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.fillStyle = `rgba(232, 196, 140,${0.25 + 0.7 * a})`;
        ctx.fillRect(-c.r, -c.r * 0.35, c.r * 2, c.r * 0.7);
        ctx.restore();
      }
    }

    if (flashLeft > 0) {
      flashLeft = Math.max(0, flashLeft - frameDt);
      const a = flashLeft / Math.max(0.01, FX.flashLife);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255,255,255,${flashPeak * a})`;
      ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
      ctx.fillStyle = `rgba(255,70,90,${0.02 * a})`;
      ctx.fillRect(-2, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
      ctx.fillStyle = `rgba(50,170,255,${0.02 * a})`;
      ctx.fillRect(2, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
      ctx.restore();
    }
  };

  const begin = () => {
    trail.begin();
    crack = null;
    intentDebug = null;
    lastPaint = 0;
    wipe();
  };

  const setPreview = (_c0: DesignPoint | null, _c1?: DesignPoint) => {
    /* 刀光改为一次性扫过，不再钉在切缝上。 */
  };

  const setCrack = (c0: DesignPoint | null, c1?: DesignPoint) => {
    crack = c0 && c1 ? { c0, c1 } : null;
  };

  const setPredicted = (points: DesignPoint[]) => {
    trail.setPredicted(points);
  };

  const setIntentDebug = (info: IntentDebug | null) => {
    intentDebug = info;
  };

  const flash = (c0: DesignPoint, c1: DesignPoint, follow = false) => {
    flashes.length = 0;
    flashes.push({ c0, c1, born: performance.now(), follow });
  };

  const finaleFlash = (c0: DesignPoint, c1: DesignPoint) => {
    flashes.length = 0;
    flashes.push({ c0, c1, born: performance.now(), follow: false, finale: true });
    flashPeak = FINALE.flashPeak;
    flashLeft = Math.max(FX.flashLife, 0.09);
  };

  const freezeFlash = () => {
    for (const f of flashes) {
      if (f.follow && crack) {
        f.c0 = crack.c0;
        f.c1 = crack.c1;
      }
      f.follow = false;
    }
  };

  const push = (p: DesignPoint) => {
    trail.push(p);
  };

  const burstChips = (
    c0: DesignPoint,
    c1: DesignPoint,
    hit: number,
  ) => {
    if (!FX.chips) return;
    const dx = c1.x - c0.x;
    const dy = c1.y - c0.y;
    const len = Math.hypot(dx, dy) || 1;
    const tx = dx / len;
    const ty = dy / len;
    const px = -ty;
    const py = tx;
    const n = Math.max(4, Math.round(FX.chipCount * (0.45 + 0.55 * hit)));
    const spd = FX.chipSpeed * (0.55 + 0.45 * hit);
    for (let i = 0; i < n; i++) {
      const u = (i + Math.random() * 0.6) / n;
      const side = i % 2 === 0 ? 1 : -1;
      const jitter = (Math.random() - 0.5) * spd * 0.45;
      chips.push({
        x: c0.x + dx * u,
        y: c0.y + dy * u,
        vx: px * side * spd * (0.6 + Math.random() * 0.8) + tx * jitter,
        vy: py * side * spd * (0.6 + Math.random() * 0.8) + ty * jitter,
        life: FX.chipLife * (0.7 + Math.random() * 0.5),
        max: FX.chipLife,
        r:
          Math.random() < 0.28
            ? 2.5 + Math.random() * 2.2 * (0.55 + hit)
            : 1.3 + Math.random() * 1.6 * (0.55 + hit),
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 18,
      });
    }
  };

  const impactFlash = (hit: number) => {
    if (hit < FX.flashAt) return;
    flashPeak = 0.035;
    flashLeft = FX.flashLife;
  };

  const end = () => {
    trail.end();
    crack = null;
  };

  const clear = () => {
    trail.clear();
    flashes.length = 0;
    crack = null;
    intentDebug = null;
    lastPaint = 0;
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
    setCrack,
    setPredicted,
    setIntentDebug,
    flash,
    finaleFlash,
    freezeFlash,
    burstChips,
    impactFlash,
    end,
    step,
    clear,
  };
}
