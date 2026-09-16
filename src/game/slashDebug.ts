import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../adapt/design';
import { FLASH, FX, INTENT, TRAIL } from './design';
import type { DesignPoint } from './slashInput';

export type IntentDebug = {
  geom: { c0: DesignPoint; c1: DesignPoint } | null;
  locked: { c0: DesignPoint; c1: DesignPoint } | null;
  commit: { c0: DesignPoint; c1: DesignPoint } | null;
  stable: number;
  lockedFlag: boolean;
};

type TrailPt = DesignPoint;

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

function dist(a: DesignPoint, b: DesignPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pathLen(pts: DesignPoint[]): number {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += dist(pts[i - 1], pts[i]);
  return n;
}

function lerpPt(a: DesignPoint, b: DesignPoint, t: number): DesignPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function crTime(ti: number, a: DesignPoint, b: DesignPoint): number {
  return ti + Math.sqrt(Math.max(dist(a, b), 1e-4));
}

/** 向心 Catmull-Rom：穿过采样点，段内丝滑，急转不打结。 */
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
  const out: DesignPoint[] = [];
  const last = pts.length - 1;
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

/** 只留刀尖往回 `maxLen` 的一段；尾巴落在边上则插一个点。 */
function clipFromHead(pts: TrailPt[], maxLen: number): void {
  if (pts.length === 0) return;
  if (maxLen <= 0.35) {
    const head = pts[pts.length - 1];
    pts.length = 0;
    pts.push(head);
    return;
  }
  let acc = 0;
  for (let i = pts.length - 1; i > 0; i--) {
    const d = dist(pts[i], pts[i - 1]);
    if (acc + d >= maxLen) {
      const t = (maxLen - acc) / (d || 1);
      const cut: TrailPt = {
        x: pts[i].x + (pts[i - 1].x - pts[i].x) * t,
        y: pts[i].y + (pts[i - 1].y - pts[i].y) * t,
      };
      pts.splice(0, i, cut);
      return;
    }
    acc += d;
  }
}

type FlashSeg = {
  c0: DesignPoint;
  c1: DesignPoint;
  born: number;
  follow: boolean;
};

/** 方向跟夹缝，长度拉到 spanMin 再甩出出端。 */
function flashAxis(
  c0: DesignPoint,
  c1: DesignPoint,
): [DesignPoint, DesignPoint] {
  const dx = c1.x - c0.x;
  const dy = c1.y - c0.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
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
  const pts: TrailPt[] = [];
  const flashes: FlashSeg[] = [];
  let crack: { c0: DesignPoint; c1: DesignPoint } | null = null;
  let predicted: DesignPoint[] = [];
  let intentDebug: IntentDebug | null = null;
  let emitting = false;
  let shownLen = 0;
  let retractFrom = 0;
  let lastPaint = 0;
  let lastHead: DesignPoint | null = null;
  let lastHeadT = 0;
  let tipSpeed = 0;
  let stillSec = 0;
  let filt: DesignPoint | null = null;
  const chips: Chip[] = [];
  let flashLeft = 0;
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

  const retractTrail = (now: number) => {
    const dt = lastPaint ? Math.min(0.05, (now - lastPaint) / 1000) : 0;
    frameDt = dt;
    lastPaint = now;
    /** 无新点超过 still+80ms 才清速度，避免慢划事件稀被当成停下。 */
    const idleMs = Math.max(80, TRAIL.still * 1000 + 40);
    if (lastHeadT && now - lastHeadT > idleMs) tipSpeed = 0;

    const cap = Math.max(8, TRAIL.maxLen);
    if (emitting && tipSpeed > TRAIL.stopSpeed) stillSec = 0;
    else stillSec += dt;
    const moving = emitting && stillSec < TRAIL.still;
    const target = moving ? cap : 0;
    const rate = cap / Math.max(0.05, TRAIL.life);
    if (target >= shownLen) {
      shownLen = Math.min(cap, pathLen(pts));
      retractFrom = shownLen;
    } else {
      shownLen = Math.max(0, shownLen - rate * dt);
    }
    clipFromHead(pts, shownLen);
  };

  const paint = (now: number) => {
    wipe();
    retractTrail(now);

    const flashLifeMs = FLASH.life * 1000;
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

    const drawFlash = (c0: DesignPoint, c1: DesignPoint, age: number) => {
      if (!FLASH.show || age <= 0 || age >= 1) return;
      const [a, b] = flashAxis(c0, c1);
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
      const u0 = 0;
      const u1 = Math.max(0.06, lenT);
      const halfW =
        (FLASH.coreW * (1 - lenT) + FLASH.coreWMin * lenT) * fade;
      if (u1 - u0 < 0.02 || halfW < 0.08 || fade < 0.03) return;
      const tail = lerpPt(a, b, u0);
      const head = lerpPt(a, b, u1);
      ctx.save();
      ctx.shadowColor = `rgba(210, 235, 255, ${0.85 * fade})`;
      ctx.shadowBlur = FLASH.glowW * dpr * Math.max(0.2, fade);
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
      const age = (now - f.born) / flashLifeMs;
      if (age >= 1) {
        flashes.splice(i, 1);
        continue;
      }
      const c0 = f.follow && crack ? crack.c0 : f.c0;
      const c1 = f.follow && crack ? crack.c1 : f.c1;
      drawFlash(c0, c1, age);
    }

    const ribbon = splineRibbon(pts, TRAIL.subdiv);
    const distFromHead: number[] = new Array(ribbon.length);
    if (ribbon.length) {
      distFromHead[ribbon.length - 1] = 0;
      for (let i = ribbon.length - 2; i >= 0; i--) {
        distFromHead[i] = distFromHead[i + 1] + dist(ribbon[i], ribbon[i + 1]);
      }
    }
    const widthMul =
      retractFrom > 1 ? Math.max(0, Math.min(1, shownLen / retractFrom)) : 1;
    const widthAt = (i: number) => {
      const span = Math.max(shownLen, 1);
      const k = Math.max(0, Math.min(1, 1 - distFromHead[i] / span));
      return (TRAIL.tailW + (TRAIL.headW - TRAIL.tailW) * k * k) * widthMul;
    };

    if (TRAIL.show && ribbon.length === 1 && emitting) {
      const head = ribbon[0];
      ctx.beginPath();
      ctx.arc(head.x, head.y, TRAIL.headW * 0.4 * widthMul, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
    } else if (TRAIL.show && ribbon.length >= 2) {
      const head = ribbon[ribbon.length - 1];
      const n = ribbon.length - 1;
      const left: DesignPoint[] = [];
      const right: DesignPoint[] = [];
      for (let i = 0; i < ribbon.length; i++) {
        const p = ribbon[i];
        const dx =
          i === 0
            ? ribbon[1].x - ribbon[0].x
            : i === n
              ? ribbon[n].x - ribbon[n - 1].x
              : ribbon[i + 1].x - ribbon[i - 1].x;
        const dy =
          i === 0
            ? ribbon[1].y - ribbon[0].y
            : i === n
              ? ribbon[n].y - ribbon[n - 1].y
              : ribbon[i + 1].y - ribbon[i - 1].y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const w = widthAt(i);
        left.push({ x: p.x + nx * w, y: p.y + ny * w });
        right.push({ x: p.x - nx * w, y: p.y - ny * w });
      }

      const tdx = ribbon[n].x - ribbon[n - 1].x;
      const tdy = ribbon[n].y - ribbon[n - 1].y;
      const tlen = Math.hypot(tdx, tdy) || 1;
      const tip = {
        x: head.x + (tdx / tlen) * TRAIL.tipLen * widthMul,
        y: head.y + (tdy / tlen) * TRAIL.tipLen * widthMul,
      };

      ctx.beginPath();
      ctx.moveTo(left[0].x, left[0].y);
      for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
      ctx.lineTo(tip.x, tip.y);
      for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
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
      ctx.fillStyle = `rgba(255,255,255,${0.035 * a})`;
      ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
      ctx.fillStyle = `rgba(255,70,90,${0.02 * a})`;
      ctx.fillRect(-2, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
      ctx.fillStyle = `rgba(50,170,255,${0.02 * a})`;
      ctx.fillRect(2, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
      ctx.restore();
    }
  };

  const begin = () => {
    pts.length = 0;
    crack = null;
    predicted = [];
    intentDebug = null;
    emitting = true;
    shownLen = 0;
    retractFrom = 0;
    lastPaint = 0;
    lastHead = null;
    lastHeadT = 0;
    tipSpeed = 0;
    stillSec = 0;
    filt = null;
    wipe();
  };

  const setPreview = (_c0: DesignPoint | null, _c1?: DesignPoint) => {
    /* 刀光改为一次性扫过，不再钉在切缝上。 */
  };

  const setCrack = (c0: DesignPoint | null, c1?: DesignPoint) => {
    crack = c0 && c1 ? { c0, c1 } : null;
  };

  const setPredicted = (points: DesignPoint[]) => {
    predicted = points;
  };

  const setIntentDebug = (info: IntentDebug | null) => {
    intentDebug = info;
  };

  const flash = (c0: DesignPoint, c1: DesignPoint, follow = false) => {
    flashes.length = 0;
    flashes.push({ c0, c1, born: performance.now(), follow });
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
    if (!emitting) return;
    const now = performance.now();
    const dt = lastHeadT ? Math.min(0.05, (now - lastHeadT) / 1000) : 0;
    let q = p;
    if (TRAIL.smooth > 0.0005) {
      if (!filt) filt = { x: p.x, y: p.y };
      else {
        const a = 1 - Math.exp(-Math.max(dt, 0.004) / TRAIL.smooth);
        filt = {
          x: filt.x + (p.x - filt.x) * a,
          y: filt.y + (p.y - filt.y) * a,
        };
      }
      q = filt;
    } else {
      filt = { x: p.x, y: p.y };
    }
    if (lastHead && dt > 0.0005) tipSpeed = dist(lastHead, q) / dt;
    lastHead = { x: q.x, y: q.y };
    lastHeadT = now;
    const last = pts[pts.length - 1];
    if (last && dist(last, q) < TRAIL.minDist) {
      last.x = q.x;
      last.y = q.y;
      return;
    }
    /** 只记真实触点。不要按判定折线线性补点，快划会变成两点之间的弦。 */
    pts.push({ x: q.x, y: q.y });
    clipFromHead(pts, Math.max(shownLen, TRAIL.maxLen));
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
    flashLeft = FX.flashLife;
  };

  const end = () => {
    emitting = false;
    crack = null;
    predicted = [];
  };

  const clear = () => {
    pts.length = 0;
    flashes.length = 0;
    crack = null;
    predicted = [];
    intentDebug = null;
    emitting = false;
    shownLen = 0;
    retractFrom = 0;
    lastPaint = 0;
    lastHead = null;
    tipSpeed = 0;
    stillSec = 0;
    filt = null;
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
    freezeFlash,
    burstChips,
    impactFlash,
    end,
    step,
    clear,
  };
}
