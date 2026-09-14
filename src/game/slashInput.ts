import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  isInDesignBounds,
  type StageLayout,
} from '../adapt/design';

export type DesignPoint = { x: number; y: number };

export type SlashStroke = {
  pointerId: number;
  points: DesignPoint[];
  armed: boolean;
  cutDone: boolean;
};

const ARM_DIST = 16;
const INTERP_GAP = 5;

function dist(a: DesignPoint, b: DesignPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
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
    onMove: (stroke: SlashStroke, lastSeg: [DesignPoint, DesignPoint]) => void;
    onEnd: (stroke: SlashStroke | null) => void;
    onStroke?: (stroke: SlashStroke) => void;
  },
): { dispose: () => void } {
  let stroke: SlashStroke | null = null;

  const finish = () => {
    if (!stroke) return;
    const ended = stroke;
    stroke = null;
    hooks.onEnd(ended);
  };

  const onDown = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    if (stroke) finish();
    const layout = getLayout();
    if (!layout) return;
    const p = eventToDesign(e, stage, layout);
    stroke = {
      pointerId: e.pointerId,
      points: [p],
      armed: false,
      cutDone: false,
    };
    hooks.onStroke?.(stroke);
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

    for (const ev of batch) {
      const p = eventToDesign(ev, stage, layout);
      const before = stroke.points.length;
      appendInterpolated(stroke.points, p);
      if (!stroke.armed && stroke.points.length >= 2) {
        const origin = stroke.points[0];
        if (dist(origin, p) >= ARM_DIST) stroke.armed = true;
      }
      if (stroke.points.length > before) {
        hooks.onStroke?.(stroke);
      }
      if (stroke.armed && stroke.points.length > before) {
        const origin = stroke.points[0];
        const latest = stroke.points[stroke.points.length - 1];
        hooks.onMove(stroke, [origin, latest]);
      }
    }
  };

  const onUp = (e: PointerEvent) => {
    if (!stroke || e.pointerId !== stroke.pointerId) return;
    finish();
  };

  const onCancel = (e: PointerEvent) => {
    if (!stroke || e.pointerId !== stroke.pointerId) return;
    stroke.cutDone = stroke.cutDone;
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
