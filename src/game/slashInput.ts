import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  isInDesignBounds,
  type StageLayout,
} from '../adapt/design';
import { SLASH } from './design';

export type DesignPoint = { x: number; y: number };

export type MeshSlashProgress = {
  c0: DesignPoint;
  c1: DesignPoint;
  chord: number;
  inside: boolean;
  enterEdge: number;
  /** 锁 A 时的单位刀向。只给快滑藏缝用；夹缝绘制从 A 跟到刀尖。 */
  dirx: number;
  diry: number;
};

export type SlashIntent = {
  locked: boolean;
  stable: number;
  c0: DesignPoint | null;
  c1: DesignPoint | null;
  earlyFlashed: boolean;
  flashHot: boolean;
  aimStable: number;
  speedSamples: number[];
};

export function emptyIntent(): SlashIntent {
  return {
    locked: false,
    stable: 0,
    c0: null,
    c1: null,
    earlyFlashed: false,
    flashHot: false,
    aimStable: 0,
    speedSamples: [],
  };
}

/** 本划余势：刚切开的那条缝，只在「还顺着甩」时有效。 */
export type ConsumedLine = {
  ox: number;
  oy: number;
  dx: number;
  dy: number;
};

export type SlashStroke = {
  pointerId: number;
  points: DesignPoint[];
  armed: boolean;
  slicedIds: Set<number>;
  progress: Map<number, MeshSlashProgress>;
  intent: SlashIntent;
  /** 本划余势。转走 / 离开走廊即清空，不必抬手。 */
  consumed: ConsumedLine[];
  /**
   * 本刀入点，只写一次，绑当时那块 mesh。
   * 同刀弯向不改 A；跟踪的 mesh 没了 / 切开成功 / 抬手才清。
   */
  enterLock: {
    meshId: number;
    c0: DesignPoint;
    enterEdge: number;
    dirx: number;
    diry: number;
  } | null;
  startedAt: number;
  lastAt: number;
};

const ARM_DIST = SLASH.armDist;
const INTERP_GAP = SLASH.interpGap;

function dist(a: DesignPoint, b: DesignPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function strokePathLength(points: DesignPoint[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += dist(points[i - 1], points[i]);
  return len;
}

export function strokeSpeedPxPerSec(stroke: SlashStroke): number {
  const dt = Math.max(0.016, (performance.now() - stroke.startedAt) / 1000);
  return strokePathLength(stroke.points) / dt;
}

export function segmentSpeedPxPerSec(
  a: DesignPoint,
  b: DesignPoint,
  dtSec: number,
): number {
  return dist(a, b) / Math.max(0.008, dtSec);
}

export function eventToDesign(
  e: PointerEvent,
  stage: HTMLElement,
  _layout: StageLayout,
): DesignPoint {
  const r = stage.getBoundingClientRect();
  const w = r.width || 1;
  const h = r.height || 1;
  return {
    x: ((e.clientX - r.left) / w) * DESIGN_WIDTH,
    y: ((e.clientY - r.top) / h) * DESIGN_HEIGHT,
  };
}

function appendInterpolated(points: DesignPoint[], next: DesignPoint): void {
  const prev = points[points.length - 1];
  if (!prev) {
    points.push(next);
    return;
  }
  const d = dist(prev, next);
  if (d < 0.5) return;
  const steps = Math.max(1, Math.ceil(d / INTERP_GAP));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    points.push({
      x: prev.x + (next.x - prev.x) * t,
      y: prev.y + (next.y - prev.y) * t,
    });
  }
}

export function createSlashInput(
  stage: HTMLElement,
  getLayout: () => StageLayout | null,
  hooks: {
    onMove: (
      stroke: SlashStroke,
      lastSeg: [DesignPoint, DesignPoint],
      dtSec: number,
    ) => void;
    onEnd: (stroke: SlashStroke | null) => void;
    onStroke?: (stroke: SlashStroke) => void;
    /** 每个触点（含 <0.5px 的慢划），只给刀痕，不进切判定。 */
    onTip?: (p: DesignPoint) => void;
    /** 仅刀痕画 ahead，不进切判定。下一 pointermove 会换一批。 */
    onPredicted?: (points: DesignPoint[]) => void;
  },
): { dispose: () => void } {
  let stroke: SlashStroke | null = null;

  const finish = () => {
    if (!stroke) return;
    const ended = stroke;
    stroke = null;
    hooks.onPredicted?.([]);
    hooks.onEnd(ended);
  };

  const onDown = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    const t = e.target;
    if (t instanceof Element && t.closest('.debug-panel')) return;
    if (stroke) finish();
    const layout = getLayout();
    if (!layout) return;
    const p = eventToDesign(e, stage, layout);
    const now = performance.now();
    stroke = {
      pointerId: e.pointerId,
      points: [p],
      armed: false,
      slicedIds: new Set(),
      progress: new Map(),
      consumed: [],
      enterLock: null,
      intent: emptyIntent(),
      startedAt: now,
      lastAt: now,
    };
    hooks.onStroke?.(stroke);
    hooks.onTip?.(p);
    e.preventDefault();
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      /* inactive pointer */
    }
  };

  const onMove = (e: PointerEvent) => {
    if (!stroke || e.pointerId !== stroke.pointerId) return;
    const layout = getLayout();
    if (!layout) return;

    const coalesced =
      typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
    const batch = coalesced.length > 0 ? coalesced : [e];

    const now = performance.now();
    const dtSec = Math.max(0.008, (now - stroke.lastAt) / 1000);
    stroke.lastAt = now;

    for (const ev of batch) {
      const p = eventToDesign(ev, stage, layout);
      const before = stroke.points.length;
      appendInterpolated(stroke.points, p);
      const added = stroke.points.length - before;
      if (!stroke.armed && stroke.points.length >= 2) {
        const origin = stroke.points[0];
        if (dist(origin, p) >= ARM_DIST) stroke.armed = true;
      }
      if (added > 0) hooks.onStroke?.(stroke);
      hooks.onTip?.(p);
      if (stroke.armed && added > 0) {
        const stepDt = dtSec / added;
        for (let i = before; i < stroke.points.length; i++) {
          hooks.onMove(stroke, [stroke.points[i - 1], stroke.points[i]], stepDt);
        }
      }
    }

    if (typeof e.getPredictedEvents === 'function') {
      const pred = e.getPredictedEvents();
      const pts: DesignPoint[] = [];
      for (const ev of pred) pts.push(eventToDesign(ev, stage, layout));
      hooks.onPredicted?.(pts);
    } else {
      hooks.onPredicted?.([]);
    }
  };

  const onUp = (e: PointerEvent) => {
    if (!stroke || e.pointerId !== stroke.pointerId) return;
    finish();
  };

  const onCancel = (e: PointerEvent) => {
    if (!stroke || e.pointerId !== stroke.pointerId) return;
    finish();
  };

  stage.style.touchAction = 'none';
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onCancel);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);

  return {
    dispose: () => {
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    },
  };
}

export function lastInBoundsSeg(
  a: DesignPoint,
  b: DesignPoint,
): [DesignPoint, DesignPoint] | null {
  const ia = isInDesignBounds(a.x, a.y, DESIGN_WIDTH, DESIGN_HEIGHT);
  const ib = isInDesignBounds(b.x, b.y, DESIGN_WIDTH, DESIGN_HEIGHT);
  if (!ia && !ib) return null;
  return [a, b];
}
