import { INTENT } from './design';
import type { CutTarget } from './cutTarget';
import {
  emptyIntent,
  segmentSpeedPxPerSec,
  type DesignPoint,
  type SlashStroke,
} from './slashInput';

function hypot(dx: number, dy: number): number {
  return Math.hypot(dx, dy);
}

export function headingAngleDeg(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const al = hypot(ax, ay) || 1;
  const bl = hypot(bx, by) || 1;
  const d = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (al * bl)));
  return (Math.acos(d) * 180) / Math.PI;
}

export function resetSlashIntent(stroke: SlashStroke): void {
  stroke.intent = emptyIntent();
}

/** 几何外推已给出贯穿弦时，用滞回决定是否点亮刀光。不改切开。 */
export function updateSlashIntent(
  stroke: SlashStroke,
  preview: CutTarget | null,
  seg: [DesignPoint, DesignPoint],
  dtSec: number,
): { c0: DesignPoint; c1: DesignPoint } | null {
  const it = stroke.intent;
  if (!preview) {
    resetSlashIntent(stroke);
    return null;
  }

  const segLen = hypot(seg[1].x - seg[0].x, seg[1].y - seg[0].y);
  if (segLen < 0.5) {
    return it.locked && it.c0 && it.c1 ? { c0: it.c0, c1: it.c1 } : null;
  }

  const ang = headingAngleDeg(
    seg[1].x - seg[0].x,
    seg[1].y - seg[0].y,
    preview.c1.x - preview.c0.x,
    preview.c1.y - preview.c0.y,
  );
  const fromEnter = hypot(seg[1].x - preview.c0.x, seg[1].y - preview.c0.y);
  const speed = segmentSpeedPxPerSec(seg[0], seg[1], dtSec);

  if (it.locked) {
    if (ang > INTENT.unlockAngle) {
      resetSlashIntent(stroke);
      return null;
    }
    it.c0 = preview.c0;
    it.c1 = preview.c1;
    return { c0: it.c0, c1: it.c1 };
  }

  const aligned =
    ang <= INTENT.lockAngle &&
    fromEnter >= INTENT.minFromEnter &&
    speed >= INTENT.minSpeed;

  if (!aligned) {
    it.stable = 0;
    return null;
  }

  it.stable += 1;
  if (it.stable < INTENT.lockSegs) return null;

  it.locked = true;
  it.c0 = preview.c0;
  it.c1 = preview.c1;
  return { c0: it.c0, c1: it.c1 };
}
