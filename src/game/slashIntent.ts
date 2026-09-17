import type * as THREE from 'three';
import { FLASH, INTENT, START } from './design';
import {
  chordLength,
  clipBackToEnter,
  clipChordToHull,
  clipInfiniteLineToHull,
  closestHullEdge,
  rankedHullEdges,
  pointInConvexHull,
  projectMeshHull,
  designToLocalXY,
  localXYToDesign,
  throughThreshold,
  type ProjBox,
} from './slashHit';
import { followBlocks, stepFollow } from './slashFollow';
import {
  emptyIntent,
  segmentSpeedPxPerSec,
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

export type IntentPhase = 'idle' | 'arming' | 'track' | 'aimed' | 'hold';

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
  /** 板内路程超标，本刀将取消。 */
  scribble: boolean;
  /** 本段未提交原因（调试）。提交成功为 commit。 */
  why: string;
};

let debugWhy = '';

function note(msg: string): null {
  debugWhy = msg;
  return null;
}

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

function slashDeepEnough(
  c0: DesignPoint,
  c1: DesignPoint,
  box: ProjBox,
): boolean {
  return chordLength(c0, c1) >= throughThreshold(box);
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

/** 从刀尖往回走，最近一次出板点；太远的旧点不用（避免对边当入边）。 */
function recentOutside(
  points: DesignPoint[],
  hull: DesignPoint[],
  maxPath: number,
): DesignPoint | null {
  if (points.length === 0) return null;
  let path = 0;
  const tip = points[points.length - 1];
  if (!pointInConvexHull(tip, hull)) return tip;
  for (let i = points.length - 2; i >= 0; i--) {
    const p = points[i];
    const n = points[i + 1];
    path += hypot(n.x - p.x, n.y - p.y);
    if (path > maxPath) return null;
    if (!pointInConvexHull(p, hull)) return p;
  }
  return null;
}

function syncLockedA(
  stroke: SlashStroke,
  mesh: THREE.Mesh,
  camera: THREE.Camera,
  hull?: DesignPoint[],
): DesignPoint | null {
  const L = stroke.enterLock;
  if (!L || L.meshId !== mesh.id) return null;
  const p = localXYToDesign(mesh, camera, L.localX, L.localY);
  if (!p) return L.c0;
  L.c0 = p;
  if (hull && hull.length >= 3) {
    L.enterEdge = closestHullEdge(p, hull);
  }
  return p;
}

function addInBoardPath(
  stroke: SlashStroke,
  from: DesignPoint,
  to: DesignPoint,
  hull: DesignPoint[],
): void {
  const L = stroke.enterLock;
  if (!L) return;
  const clip = clipChordToHull(from, to, hull);
  if (clip) L.path += chordLength(clip.c0, clip.c1);
  else if (pointInConvexHull(from, hull) && pointInConvexHull(to, hull)) {
    L.path += chordLength(from, to);
  }
}

function pathTooLong(stroke: SlashStroke, straight: number): boolean {
  const path = stroke.enterLock?.path ?? 0;
  const chord = Math.max(1e-4, straight);
  return path / chord > START.pathChordMax;
}

function scribbleWhy(stroke: SlashStroke, straight: number): string {
  const path = stroke.enterLock?.path ?? 0;
  const chord = Math.max(1e-4, straight);
  return `乱划路程 ${(path / chord).toFixed(1)}×`;
}

function endUncutAttempt(stroke: SlashStroke, meshId: number): void {
  stroke.progress.delete(meshId);
  if (stroke.enterLock?.meshId === meshId) stroke.enterLock = null;
  resetLock(stroke);
  stroke.intent.earlyFlashed = false;
}

function lockEnter(
  stroke: SlashStroke,
  mesh: THREE.Mesh,
  camera: THREE.Camera,
  c0: DesignPoint,
  tip: DesignPoint,
  enterEdge: number,
): boolean {
  const meshId = mesh.id;
  if (stroke.enterLock) {
    const L = stroke.enterLock;
    if (L.meshId !== meshId) return false;
    const a = syncLockedA(stroke, mesh, camera) ?? L.c0;
    stroke.progress.set(meshId, {
      c0: { x: a.x, y: a.y },
      c1: tip,
      chord: chordLength(a, tip),
      inside: true,
      enterEdge: L.enterEdge,
      dirx: L.dirx,
      diry: L.diry,
    });
    return true;
  }
  if (chordLength(c0, tip) < START.lockSlop) return false;
  const local = designToLocalXY(c0, camera, mesh);
  if (!local) return false;
  const d = unitDir(c0, tip);
  stroke.enterLock = {
    meshId,
    c0: { x: c0.x, y: c0.y },
    localX: local.x,
    localY: local.y,
    enterEdge,
    dirx: d.dx,
    diry: d.dy,
    path: chordLength(c0, tip),
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
    const prox = 1 - row.dist / radius;
    const ex = e1.x - e0.x;
    const ey = e1.y - e0.y;
    const el = hypot(ex, ey) || 1;
    const nx = -ey / el;
    const ny = ex / el;
    /** 入边 = 刀向穿入（与穿出对边相反），避免右侧进来锁到左侧。 */
    const incoming = Math.max(0, -(nx * sdx + ny * sdy));
    const score = 0.7 * prox + 0.3 * incoming;
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
  from?: DesignPoint,
): CutTarget | null {
  if (from && followBlocks(stroke, from, tip, meshes, camera)) return null;
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
  const sorted = s.slice().sort((x, y) => x - y);
  return sorted[Math.floor(sorted.length / 2)] ?? fallback;
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
  const mesh =
    (trackedId != null ? meshes.find((m) => m.id === trackedId) : undefined) ??
    meshes.find((m) => !stroke.slicedIds.has(m.id));
  if (!mesh) return null;
  const proj = projectMeshHull(mesh, camera);
  if (!proj) return null;
  const a =
    syncLockedA(stroke, mesh, camera, proj.hull) ?? locked?.c0 ?? st?.c0;
  if (!a) return null;
  if (!pointInConvexHull(tip, proj.hull)) return null;

  const dx = locked?.dirx ?? st?.dirx ?? 0;
  const dy = locked?.diry ?? st?.diry ?? 0;
  const fast = medianSpeed(stroke, speed) >= FLASH.crackHoldSpeed;
  if (fast && dx * dx + dy * dy > 1e-8) {
    const lat = Math.abs((tip.x - a.x) * dy - (tip.y - a.y) * dx);
    if (lat > FLASH.crackLeave) return null;
  }

  const hit =
    clipChordToHull(a, tip, proj.hull) ?? clipBackToEnter(a, tip, proj.hull);
  if (hit && chordLength(a, hit.c1) >= 1) {
    return { c0: a, c1: hit.c1 };
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
  debugWhy = '';
  if (chordLength(a, b) < 1e-4) return note('微段太短');

  if (stepFollow(stroke, a, b, meshes, camera)) {
    return note('走廊余势（贴着上一刀）');
  }

  const live = meshes.filter(
    (m) => !stroke.slicedIds.has(m.id) && !skipIds.has(m.id),
  );

  const trackedId = stroke.progress.size ? [...stroke.progress.keys()][0] : null;

  if (trackedId != null) {
    const mesh = live.find((m) => m.id === trackedId);
    const st = stroke.progress.get(trackedId);
    if (!mesh || !st) {
      stroke.progress.clear();
      if (stroke.enterLock?.meshId === trackedId) stroke.enterLock = null;
      return note('跟踪的板没了');
    }
    const proj = projectMeshHull(mesh, camera);
    if (!proj) {
      stroke.progress.clear();
      if (stroke.enterLock?.meshId === trackedId) stroke.enterLock = null;
      return note('凸包投影失败');
    }
    const lockedA = syncLockedA(stroke, mesh, camera, proj.hull);
    if (lockedA) {
      st.c0 = lockedA;
      st.enterEdge = stroke.enterLock?.enterEdge ?? st.enterEdge;
    }
    addInBoardPath(stroke, a, b, proj.hull);
    const clipped = clipChordToHull(a, b, proj.hull);
    if (clipped) {
      st.c1 = clipped.c1;
      st.chord += chordLength(clipped.c0, clipped.c1);
    }
    const nowInside = pointInConvexHull(b, proj.hull);
    st.inside = nowInside;
    if (nowInside) {
      const speed = medianSpeed(stroke, segmentSpeedPxPerSec(a, b, dtSec));
      const need = endTravelNeed(speed);
      if (need >= 0.999) return note('慢划须真出边（板内不补）');
      const line = clipInfiniteLineToHull(st.c0, b, proj.hull);
      if (!line) return note('青线打不出出点');
      const exit = line[1];
      const full = chordLength(st.c0, exit);
      const exitEdge = closestHullEdge(exit, proj.hull);
      if (!twoEdges(st.enterEdge, exitEdge, st.c0, exit, proj.hull)) {
        return note(`补切同边 e${st.enterEdge}→e${exitEdge}`);
      }
      const ang = headingAngleDeg(
        b.x - a.x,
        b.y - a.y,
        exit.x - st.c0.x,
        exit.y - st.c0.y,
      );
      if (ang > FLASH.aimAngle) return note(`未对准青线 ${ang.toFixed(0)}°`);
      const ratio = travelAlongCyan(st.c0, exit, b);
      if (ratio < need) {
        return note(`行程 ${(ratio * 100).toFixed(0)}% < ${(need * 100).toFixed(0)}%`);
      }
      if (!slashDeepEnough(st.c0, exit, proj.box)) return note('补切不够深');
      if (pathTooLong(stroke, full)) return note(scribbleWhy(stroke, full));
      stroke.progress.delete(trackedId);
      debugWhy = 'commit 板内补切';
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
      endUncutAttempt(stroke, trackedId);
      return note(`同边蹭 e${st.enterEdge}→e${exitEdge}`);
    }
    if (!slashDeepEnough(c0, c1, proj.box)) {
      endUncutAttempt(stroke, trackedId);
      return note('出边不够深');
    }
    const straight = chordLength(c0, c1);
    if (pathTooLong(stroke, straight)) {
      endUncutAttempt(stroke, trackedId);
      return note(scribbleWhy(stroke, straight));
    }
    stroke.progress.delete(trackedId);
    debugWhy = 'commit 真出边';
    return {
      mesh,
      c0,
      c1,
      chord: Math.max(st.chord, straight),
      enterEdge: st.enterEdge,
    };
  }

  for (const mesh of live) {
    const proj = projectMeshHull(mesh, camera);
    if (!proj) continue;
    const insideB = pointInConvexHull(b, proj.hull);
    const outside = recentOutside(stroke.points, proj.hull, START.fastDist * 3);
    const everOutside = lastOutside(stroke.points, proj.hull);
    const fromOutside = !pointInConvexHull(a, proj.hull);
    const micro = clipChordToHull(a, b, proj.hull);
    /**
     * 入边用刀尖附近最近一次出板点，不用整划最远的旧点。
     */
    const strokeClip =
      outside && insideB
        ? clipChordToHull(outside, b, proj.hull) ??
          clipBackToEnter(outside, b, proj.hull)
        : null;
    const clipped = strokeClip ?? micro;
    const entered = !!clipped || insideB;
    if (!entered) continue;

    if (!strokeClip && insideB) {
      const speed = medianSpeed(stroke, segmentSpeedPxPerSec(a, b, dtSec));
      const radius = startRadius(speed);
      const near = rankedHullEdges(b, proj.hull)[0];
      if (
        near &&
        near.dist <= radius &&
        chordLength(near.point, b) >= START.lockSlop
      ) {
        lockEnter(stroke, mesh, camera, near.point, b, near.edge);
        return note('已锁 A，等出边');
      }
    }

    if (!fromOutside && !outside && !everOutside) {
      const speed = medianSpeed(stroke, segmentSpeedPxPerSec(a, b, dtSec));
      const radius = startRadius(speed);
      const slash = { x: b.x - a.x, y: b.y - a.y };
      if (hypot(slash.x, slash.y) < START.lockSlop) continue;
      const picked = pickEnterByScore(b, slash, proj.hull, radius);
      if (!picked) continue;
      lockEnter(stroke, mesh, camera, picked.point, b, picked.edge);
      return note('已锁 A，等出边');
    }

    const inf = clipped ? null : clipInfiniteLineToHull(a, b, proj.hull);
    const c0 = clipped?.c0 ?? inf?.[0];
    if (!c0) continue;
    const c1 = clipped?.c1 ?? b;
    const enterEdge = clipped
      ? clipped.enterEdge
      : closestHullEdge(c0, proj.hull);
    const exitEdge = clipped ? clipped.exitEdge : -1;
    const chord = clipped ? chordLength(c0, c1) : 0;

    if (
      fromOutside &&
      micro &&
      !insideB &&
      twoEdges(enterEdge, exitEdge, c0, c1, proj.hull)
    ) {
      if (slashDeepEnough(c0, c1, proj.box)) {
        debugWhy = 'commit 一段贯穿';
        return { mesh, c0, c1, chord, enterEdge };
      }
      note('一段贯穿但不够深');
      continue;
    }

    lockEnter(stroke, mesh, camera, c0, b, enterEdge);
    return note('已锁 A，等出边');
  }
  if (!debugWhy) note(stroke.armed ? '未入板' : '未出刃');
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
  const speed = pushSpeed(
    stroke,
    segmentSpeedPxPerSec(seg[0], tip, dtSec),
  );
  const it = stroke.intent;

  const crack = crackAlongStroke(meshes, camera, stroke, tip, seg[0], speed);
  const commit = resolveCutBySegment(
    meshes,
    camera,
    stroke,
    seg,
    skipIds,
    dtSec,
  );

  const cyan = previewCutChord(meshes, camera, stroke, tip, seg[0]);
  const lockedChord = updateSlashIntent(stroke, cyan, seg, dtSec);

  let travelRatio = 0;
  if (cyan) travelRatio = travelAlongCyan(cyan.c0, cyan.c1, tip);
  else if (commit) travelRatio = 1;

  let earlyFlash = false;
  let commitFlash = false;
  const scribble =
    debugWhy.startsWith('乱划路程') ||
    (!!cyan && pathTooLong(stroke, chordLength(cyan.c0, cyan.c1)));

  if (scribble) {
    it.flashHot = false;
    it.aimStable = 0;
  } else if (commit) {
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
        travelRatio >= endTravelNeed(speed);
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
  if (followBlocks(stroke, seg[0], tip, meshes, camera)) phase = 'hold';
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
    scribble,
    why:
      debugWhy ||
      (followBlocks(stroke, seg[0], tip, meshes, camera)
        ? '走廊余势（贴着上一刀）'
        : ''),
  };
}
