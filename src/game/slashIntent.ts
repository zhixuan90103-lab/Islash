import type * as THREE from 'three';
import { FLASH, INTENT, SLASH, START } from './design';
import {
  chordLength,
  clipBackToEnter,
  clipChordToHull,
  clipInfiniteLineToHull,
  closestHullEdge,
  rankedHullEdges,
  pointInConvexHull,
  projectMeshHull,
  throughThreshold,
  type ProjBox,
} from './slashHit';
import {
  emptyIntent,
  segmentSpeedPxPerSec,
  type ConsumedLine,
  type DesignPoint,
  type SlashStroke,
} from './slashInput';

export type CutTarget = {
  mesh: THREE.Mesh;
  c0: DesignPoint;
  c1: DesignPoint;
  chord: number;
  enterEdge?: number;
};

export type IntentPhase =
  | 'idle'
  | 'arming'
  | 'miss'
  | 'track'
  | 'aimed'
  | 'hold';

export type IntentFrame = {
  phase: IntentPhase;
  enter: DesignPoint | null;
  enterEdge: number;
  meshId: number | null;
  cyan: { c0: DesignPoint; c1: DesignPoint } | null;
  crack: { c0: DesignPoint; c1: DesignPoint } | null;
  locked: boolean;
  travelRatio: number;
  speed: number;
  earlyFlash: boolean;
  commit: CutTarget | null;
  commitFlash: boolean;
};

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

function unitDir(from: DesignPoint, to: DesignPoint): { dx: number; dy: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = hypot(dx, dy) || 1;
  return { dx: dx / len, dy: dy / len };
}

export function resetLock(stroke: SlashStroke): void {
  const early = stroke.intent.earlyFlashed;
  const speeds = stroke.intent.speedSamples;
  stroke.intent.locked = false;
  stroke.intent.stable = 0;
  stroke.intent.c0 = null;
  stroke.intent.c1 = null;
  stroke.intent.flashHot = false;
  stroke.intent.aimStable = 0;
  stroke.intent.earlyFlashed = early;
  stroke.intent.speedSamples = speeds;
}

export function resetSlashIntent(stroke: SlashStroke): void {
  stroke.intent = emptyIntent();
  stroke.enterLock = null;
}

export function twoEdges(
  enterEdge: number,
  exitEdge: number,
  c0: DesignPoint,
  c1: DesignPoint,
  hull: DesignPoint[],
): boolean {
  const e = enterEdge >= 0 ? enterEdge : closestHullEdge(c0, hull);
  const x = exitEdge >= 0 ? exitEdge : closestHullEdge(c1, hull);
  return e !== x;
}

function distToConsumed(p: DesignPoint, line: ConsumedLine): number {
  return Math.abs((p.x - line.ox) * line.dy - (p.y - line.oy) * line.dx);
}

export function consumeCutLine(
  stroke: SlashStroke,
  c0: DesignPoint,
  c1: DesignPoint,
): void {
  const dx = c1.x - c0.x;
  const dy = c1.y - c0.y;
  const len = hypot(dx, dy);
  if (len < 1) return;
  stroke.consumed.push({
    ox: c0.x,
    oy: c0.y,
    dx: dx / len,
    dy: dy / len,
  });
}

function releaseConsumed(
  stroke: SlashStroke,
  a: DesignPoint,
  b: DesignPoint,
): void {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const vl = hypot(vx, vy);
  if (vl < 1) return;
  const ux = vx / vl;
  const uy = vy / vl;
  const w = START.corridor;
  stroke.consumed = stroke.consumed.filter((line) => {
    if (distToConsumed(b, line) > w) return true;
    return ux * line.dx + uy * line.dy >= -0.15;
  });
}

function occupying(stroke: SlashStroke, tip: DesignPoint): boolean {
  const w = START.corridor;
  return stroke.consumed.some((line) => distToConsumed(tip, line) <= w);
}

function edgeOnConsumed(
  e0: DesignPoint,
  e1: DesignPoint,
  stroke: SlashStroke,
): boolean {
  const w = START.corridor;
  return stroke.consumed.some(
    (line) => distToConsumed(e0, line) <= w && distToConsumed(e1, line) <= w,
  );
}

function chordOnConsumed(
  c0: DesignPoint,
  c1: DesignPoint,
  stroke: SlashStroke,
): boolean {
  return edgeOnConsumed(c0, c1, stroke);
}

function slashDeepEnough(
  c0: DesignPoint,
  c1: DesignPoint,
  box: ProjBox,
): boolean {
  const len = chordLength(c0, c1);
  return len >= Math.max(SLASH.minChord, throughThreshold(box));
}

function speedBlend(speed: number): number {
  const cap = Math.max(1, START.fastSpeed);
  return Math.max(0, Math.min(1, speed / cap));
}

function startRadius(speed: number): number {
  const t = speedBlend(speed);
  return START.slowDist + (START.fastDist - START.slowDist) * t;
}

export function endTravelNeed(speed: number): number {
  const t = speedBlend(speed);
  return 1 - (1 - START.endTravelFast) * t;
}

function lastOutside(
  points: DesignPoint[],
  hull: DesignPoint[],
): DesignPoint | null {
  let found: DesignPoint | null = null;
  for (const p of points) {
    if (!pointInConvexHull(p, hull)) found = p;
  }
  return found;
}

function lockEnter(
  stroke: SlashStroke,
  meshId: number,
  c0: DesignPoint,
  tip: DesignPoint,
  enterEdge: number,
): boolean {
  if (stroke.enterLock) {
    const L = stroke.enterLock;
    stroke.progress.set(meshId, {
      c0: { x: L.c0.x, y: L.c0.y },
      c1: tip,
      chord: chordLength(L.c0, tip),
      inside: true,
      enterEdge: L.enterEdge,
      dirx: L.dirx,
      diry: L.diry,
    });
    return true;
  }
  if (chordLength(c0, tip) < START.lockSlop) return false;
  const d = unitDir(c0, tip);
  stroke.enterLock = {
    c0: { x: c0.x, y: c0.y },
    enterEdge,
    dirx: d.dx,
    diry: d.dy,
  };
  stroke.progress.set(meshId, {
    c0: { x: c0.x, y: c0.y },
    c1: tip,
    chord: chordLength(c0, tip),
    inside: true,
    enterEdge,
    dirx: d.dx,
    diry: d.dy,
  });
  return true;
}

function pickEnterByScore(
  press: DesignPoint,
  slash: DesignPoint,
  hull: DesignPoint[],
  radius: number,
  stroke: SlashStroke,
): { edge: number; point: DesignPoint } | null {
  const ranked = rankedHullEdges(press, hull);
  const sl = hypot(slash.x, slash.y) || 1;
  const sdx = slash.x / sl;
  const sdy = slash.y / sl;
  let best: { edge: number; point: DesignPoint; score: number } | null = null;
  const n = hull.length;
  for (let i = 0; i < n; i++) {
    const row = ranked.find((r) => r.edge === i);
    if (!row || row.dist > radius) continue;
    const e0 = hull[i];
    const e1 = hull[(i + 1) % n];
    if (edgeOnConsumed(e0, e1, stroke)) continue;
    const prox = 1 - row.dist / radius;
    const ex = e1.x - e0.x;
    const ey = e1.y - e0.y;
    const el = hypot(ex, ey) || 1;
    const nx = -ey / el;
    const ny = ex / el;
    const align = Math.max(0, nx * sdx + ny * sdy);
    const score = 0.55 * prox + 0.45 * align;
    if (!best || score > best.score) {
      best = { edge: i, point: row.point, score };
    }
  }
  if (!best || best.score < START.scoreMin) return null;
  return { edge: best.edge, point: best.point };
}

function travelAlongCyan(
  c0: DesignPoint,
  c1: DesignPoint,
  tip: DesignPoint,
): number {
  const ax = c1.x - c0.x;
  const ay = c1.y - c0.y;
  const full = hypot(ax, ay) || 1;
  const traveled = ((tip.x - c0.x) * ax + (tip.y - c0.y) * ay) / full;
  return traveled / full;
}

function pushSpeed(stroke: SlashStroke, speed: number): number {
  const w = Math.max(1, START.speedWindow);
  const s = stroke.intent.speedSamples;
  s.push(speed);
  if (s.length > w) s.splice(0, s.length - w);
  const sorted = s.slice().sort((x, y) => x - y);
  return sorted[Math.floor(sorted.length / 2)] ?? speed;
}

export function previewCutChord(
  meshes: THREE.Mesh[],
  camera: THREE.Camera,
  stroke: SlashStroke,
  tip: DesignPoint,
): CutTarget | null {
  if (occupying(stroke, tip)) return null;
  const trackedId = stroke.progress.size ? [...stroke.progress.keys()][0] : null;
  if (trackedId == null) return null;
  const st = stroke.progress.get(trackedId);
  const mesh = meshes.find((m) => m.id === trackedId);
  if (!st || !mesh) return null;
  const proj = projectMeshHull(mesh, camera);
  if (!proj) return null;
  const dx = tip.x - st.c0.x;
  const dy = tip.y - st.c0.y;
  if (dx * dx + dy * dy < 4) return null;
  const line = clipInfiniteLineToHull(st.c0, tip, proj.hull);
  if (!line) return null;
  const [c0, c1] = line;
  if (!twoEdges(st.enterEdge, closestHullEdge(c1, proj.hull), c0, c1, proj.hull)) {
    return null;
  }
  return { mesh, c0, c1, chord: chordLength(c0, c1) };
}

function medianSpeed(stroke: SlashStroke, fallback: number): number {
  const s = stroke.intent.speedSamples;
  if (s.length === 0) return fallback;
  const all = s.concat(fallback).sort((x, y) => x - y);
  return all[Math.floor(all.length / 2)] ?? fallback;
}

export function crackAlongStroke(
  meshes: THREE.Mesh[],
  camera: THREE.Camera,
  stroke: SlashStroke,
  tip: DesignPoint,
  _from?: DesignPoint,
  speed = 0,
): { c0: DesignPoint; c1: DesignPoint } | null {
  const locked = stroke.enterLock;
  const trackedId = stroke.progress.size ? [...stroke.progress.keys()][0] : null;
  const st = trackedId != null ? stroke.progress.get(trackedId) : undefined;
  const a0 = locked?.c0 ?? st?.c0;
  if (!a0) return null;

  const mesh =
    (trackedId != null ? meshes.find((m) => m.id === trackedId) : undefined) ??
    meshes.find((m) => !stroke.slicedIds.has(m.id));
  if (!mesh) return null;
  const proj = projectMeshHull(mesh, camera);
  if (!proj) return null;
  if (!pointInConvexHull(tip, proj.hull)) return null;

  const dx = locked?.dirx ?? st?.dirx ?? 0;
  const dy = locked?.diry ?? st?.diry ?? 0;
  const fast = medianSpeed(stroke, speed) >= FLASH.crackHoldSpeed;
  if (fast && dx * dx + dy * dy > 1e-8) {
    const lat = Math.abs((tip.x - a0.x) * dy - (tip.y - a0.y) * dx);
    if (lat > FLASH.crackLeave) return null;
  }

  const hit =
    clipChordToHull(a0, tip, proj.hull) ?? clipBackToEnter(a0, tip, proj.hull);
  if (hit && chordLength(a0, hit.c1) >= 1) {
    return { c0: a0, c1: hit.c1 };
  }
  return null;
}

export function resolveCutBySegment(
  meshes: THREE.Mesh[],
  camera: THREE.Camera,
  stroke: SlashStroke,
  seg: [DesignPoint, DesignPoint],
  skipIds: Set<number>,
  dtSec: number,
): CutTarget | null {
  const [a, b] = seg;
  if (chordLength(a, b) < 1e-4) return null;

  releaseConsumed(stroke, a, b);
  if (occupying(stroke, b)) return null;

  const live = meshes.filter(
    (m) => !stroke.slicedIds.has(m.id) && !skipIds.has(m.id),
  );

  const trackedId = stroke.progress.size ? [...stroke.progress.keys()][0] : null;

  if (trackedId != null) {
    const mesh = live.find((m) => m.id === trackedId);
    const st = stroke.progress.get(trackedId);
    if (!mesh || !st) {
      stroke.progress.clear();
      return null;
    }
    const proj = projectMeshHull(mesh, camera);
    if (!proj) {
      stroke.progress.clear();
      return null;
    }
    const clipped = clipChordToHull(a, b, proj.hull);
    if (clipped) {
      st.c1 = clipped.c1;
      st.chord += chordLength(clipped.c0, clipped.c1);
    }
    const nowInside = pointInConvexHull(b, proj.hull);
    st.inside = nowInside;
    if (nowInside) {
      const speed = pushSpeed(stroke, segmentSpeedPxPerSec(a, b, dtSec));
      const need = endTravelNeed(speed);
      if (need >= 0.999) return null;
      const line = clipInfiniteLineToHull(st.c0, b, proj.hull);
      if (!line) return null;
      const exit = line[1];
      const full = chordLength(st.c0, exit);
      const exitEdge = closestHullEdge(exit, proj.hull);
      if (!twoEdges(st.enterEdge, exitEdge, st.c0, exit, proj.hull)) return null;
      const ang = headingAngleDeg(
        b.x - a.x,
        b.y - a.y,
        exit.x - st.c0.x,
        exit.y - st.c0.y,
      );
      if (ang > FLASH.aimAngle) return null;
      const ratio = travelAlongCyan(st.c0, exit, b);
      if (ratio < need) return null;
      if (!slashDeepEnough(st.c0, exit, proj.box)) return null;
      if (chordOnConsumed(st.c0, exit, stroke)) return null;
      stroke.progress.delete(trackedId);
      return {
        mesh,
        c0: st.c0,
        c1: exit,
        chord: Math.max(st.chord, full),
        enterEdge: st.enterEdge,
      };
    }

    /**
     * 真出边：微段可能跳过凸包（插值稀）。微段裁不到时用 A→刀尖无限直线出点。
     * 同边蹭仍丢掉跟踪；对边且够深则提交。
     */
    let c0 = st.c0;
    let c1 = clipped?.c1 ?? st.c1;
    let exitEdge = clipped
      ? clipped.exitEdge
      : closestHullEdge(c1, proj.hull);
    const microOk =
      !!clipped &&
      twoEdges(st.enterEdge, exitEdge, c0, c1, proj.hull) &&
      slashDeepEnough(c0, c1, proj.box);
    if (!microOk) {
      const line = clipInfiniteLineToHull(st.c0, b, proj.hull);
      if (line) {
        c0 = st.c0;
        c1 = line[1];
        exitEdge = closestHullEdge(c1, proj.hull);
      }
    }
    if (!twoEdges(st.enterEdge, exitEdge, c0, c1, proj.hull)) {
      /** 同边蹭 / 弯刀假出边：保住 A，不要按下一段方向重锁。 */
      return null;
    }
    if (!slashDeepEnough(c0, c1, proj.box)) {
      return null;
    }
    if (chordOnConsumed(c0, c1, stroke)) {
      return null;
    }
    stroke.progress.delete(trackedId);
    return {
      mesh,
      c0,
      c1,
      chord: Math.max(st.chord, chordLength(c0, c1)),
      enterEdge: st.enterEdge,
    };
  }

  for (const mesh of live) {
    const proj = projectMeshHull(mesh, camera);
    if (!proj) continue;
    const insideB = pointInConvexHull(b, proj.hull);
    const outside = lastOutside(stroke.points, proj.hull);
    const fromOutside = !pointInConvexHull(a, proj.hull);
    const micro = clipChordToHull(a, b, proj.hull);
    /**
     * 入边用「本划最后一个板外点 → 刀尖」，不用当前 5px 微段。
     * 微段切角噪声会锁错边（GNOME/Android：未过 slop 不锁方向）。
     */
    const strokeClip =
      outside && insideB
        ? clipChordToHull(outside, b, proj.hull) ??
          clipBackToEnter(outside, b, proj.hull)
        : null;
    const clipped = strokeClip ?? micro;
    const entered = !!clipped || insideB;
    if (!entered) continue;

    if (!fromOutside && !outside) {
      const press = stroke.points[0] ?? a;
      const speed = pushSpeed(stroke, segmentSpeedPxPerSec(a, b, dtSec));
      const radius = startRadius(speed);
      const slash = { x: b.x - press.x, y: b.y - press.y };
      if (hypot(slash.x, slash.y) < START.lockSlop) continue;
      const picked = pickEnterByScore(press, slash, proj.hull, radius, stroke);
      if (!picked) continue;
      lockEnter(stroke, mesh.id, picked.point, b, picked.edge);
      return null;
    }

    const inf = clipped ? null : clipInfiniteLineToHull(a, b, proj.hull);
    const c0 = clipped?.c0 ?? inf?.[0];
    if (!c0) continue;
    const c1 = clipped?.c1 ?? b;
    const n = proj.hull.length;
    const enterEdge = clipped
      ? clipped.enterEdge
      : closestHullEdge(c0, proj.hull);
    if (enterEdge >= 0) {
      const e0 = proj.hull[enterEdge];
      const e1 = proj.hull[(enterEdge + 1) % n];
      if (edgeOnConsumed(e0, e1, stroke)) continue;
    }
    if (chordOnConsumed(c0, clipped?.c1 ?? b, stroke)) continue;
    const exitEdge = clipped ? clipped.exitEdge : -1;
    const chord = clipped ? chordLength(c0, c1) : 0;

    if (
      fromOutside &&
      micro &&
      !insideB &&
      twoEdges(enterEdge, exitEdge, c0, c1, proj.hull)
    ) {
      if (slashDeepEnough(c0, c1, proj.box)) {
        return { mesh, c0, c1, chord, enterEdge };
      }
      continue;
    }

    lockEnter(stroke, mesh.id, c0, b, enterEdge);
    return null;
  }
  return null;
}

export function updateSlashIntent(
  stroke: SlashStroke,
  preview: CutTarget | null,
  seg: [DesignPoint, DesignPoint],
  dtSec: number,
): { c0: DesignPoint; c1: DesignPoint } | null {
  const it = stroke.intent;
  if (!preview) {
    resetLock(stroke);
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
      resetLock(stroke);
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

export function stepSlashIntent(
  meshes: THREE.Mesh[],
  camera: THREE.Camera,
  stroke: SlashStroke,
  seg: [DesignPoint, DesignPoint],
  skipIds: Set<number>,
  dtSec: number,
): IntentFrame {
  const tip = seg[1];
  const speed = segmentSpeedPxPerSec(seg[0], tip, dtSec);
  const it = stroke.intent;

  releaseConsumed(stroke, seg[0], tip);

  const crack = crackAlongStroke(meshes, camera, stroke, tip, seg[0], speed);
  const commit = resolveCutBySegment(
    meshes,
    camera,
    stroke,
    seg,
    skipIds,
    dtSec,
  );

  const cyan = previewCutChord(meshes, camera, stroke, tip);
  const lockedChord = updateSlashIntent(stroke, cyan, seg, dtSec);

  let travelRatio = 0;
  if (cyan) travelRatio = travelAlongCyan(cyan.c0, cyan.c1, tip);
  else if (commit) travelRatio = 1;

  let earlyFlash = false;
  let commitFlash = false;

  if (commit) {
    commitFlash = !it.earlyFlashed;
  } else {
    if (lockedChord && cyan) {
      const ang = headingAngleDeg(
        tip.x - seg[0].x,
        tip.y - seg[0].y,
        cyan.c1.x - cyan.c0.x,
        cyan.c1.y - cyan.c0.y,
      );
      if (ang <= FLASH.aimAngle) it.aimStable += 1;
      else it.aimStable = 0;
      const aimed =
        it.aimStable >= FLASH.aimSegs &&
        travelRatio >= endTravelNeed(pushSpeed(stroke, speed));
      if (aimed) it.flashHot = true;
    } else {
      it.flashHot = false;
      it.aimStable = 0;
    }
    if (lockedChord && it.flashHot && !it.earlyFlashed) {
      it.earlyFlashed = true;
      earlyFlash = true;
    }
  }

  const trackedId = stroke.progress.size
    ? [...stroke.progress.keys()][0]
    : null;
  const st = trackedId != null ? stroke.progress.get(trackedId) : undefined;

  let phase: IntentPhase = 'idle';
  if (occupying(stroke, tip)) phase = 'hold';
  else if (it.locked) phase = 'aimed';
  else if (trackedId != null) phase = 'track';
  else if (stroke.armed) phase = 'arming';

  return {
    phase,
    enter: st?.c0 ?? commit?.c0 ?? null,
    enterEdge: st?.enterEdge ?? -1,
    meshId: trackedId ?? commit?.mesh.id ?? null,
    cyan,
    crack,
    locked: it.locked,
    travelRatio,
    speed,
    earlyFlash,
    commit,
    commitFlash,
  };
}
