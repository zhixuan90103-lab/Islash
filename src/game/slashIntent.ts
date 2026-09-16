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
} from './slashHit';
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
};

export type IntentPhase =
  | 'idle'
  | 'arming'
  | 'miss'
  | 'track'
  | 'aimed'
  | 'awaitBlank';

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

export function resetLock(stroke: SlashStroke): void {
  const early = stroke.intent.earlyFlashed;
  stroke.intent.locked = false;
  stroke.intent.stable = 0;
  stroke.intent.c0 = null;
  stroke.intent.c1 = null;
  stroke.intent.flashHot = false;
  stroke.intent.aimStable = 0;
  stroke.intent.earlyFlashed = early;
}

export function resetSlashIntent(stroke: SlashStroke): void {
  stroke.intent = emptyIntent();
}

function tipInAnyHull(
  meshes: THREE.Mesh[],
  camera: THREE.Camera,
  tip: DesignPoint,
): boolean {
  for (const mesh of meshes) {
    const proj = projectMeshHull(mesh, camera);
    if (proj && pointInConvexHull(tip, proj.hull)) return true;
  }
  return false;
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

export function previewCutChord(
  meshes: THREE.Mesh[],
  camera: THREE.Camera,
  stroke: SlashStroke,
  tip: DesignPoint,
): CutTarget | null {
  if (stroke.awaitBlank) return null;
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

export function crackAlongStroke(
  meshes: THREE.Mesh[],
  camera: THREE.Camera,
  stroke: SlashStroke,
  tip: DesignPoint,
  from?: DesignPoint,
): { c0: DesignPoint; c1: DesignPoint } | null {
  const trackedId = stroke.progress.size ? [...stroke.progress.keys()][0] : null;
  if (trackedId != null) {
    const st = stroke.progress.get(trackedId);
    const mesh = meshes.find((m) => m.id === trackedId);
    if (st && mesh) {
      const proj = projectMeshHull(mesh, camera);
      if (proj) {
        const hit = clipBackToEnter(st.c0, tip, proj.hull);
        if (hit && chordLength(hit.c0, hit.c1) >= 1) {
          return { c0: hit.c0, c1: hit.c1 };
        }
      }
    }
  }

  if (stroke.slicedIds.size === 0) return null;
  const origin = from ?? tip;
  for (const mesh of meshes) {
    if (stroke.slicedIds.has(mesh.id)) continue;
    const proj = projectMeshHull(mesh, camera);
    if (!proj || !pointInConvexHull(tip, proj.hull)) continue;
    const hit = clipBackToEnter(origin, tip, proj.hull);
    if (hit && chordLength(hit.c0, hit.c1) >= 1) {
      return { c0: hit.c0, c1: hit.c1 };
    }
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

  if (stroke.awaitBlank) {
    if (!tipInAnyHull(meshes, camera, b)) stroke.awaitBlank = false;
    else return null;
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
      const speed = segmentSpeedPxPerSec(a, b, dtSec);
      if (speed < START.fastSpeed) return null;
      const line = clipInfiniteLineToHull(st.c0, b, proj.hull);
      if (!line) return null;
      const exit = line[1];
      const exitEdge = closestHullEdge(exit, proj.hull);
      if (!twoEdges(st.enterEdge, exitEdge, st.c0, exit, proj.hull)) return null;
      const ratio = travelAlongCyan(st.c0, exit, b);
      if (ratio < FLASH.minTravelRatio) return null;
      stroke.progress.delete(trackedId);
      return {
        mesh,
        c0: st.c0,
        c1: exit,
        chord: Math.max(st.chord, chordLength(st.c0, exit)),
      };
    }

    const exitEdge = clipped
      ? clipped.exitEdge
      : closestHullEdge(st.c1, proj.hull);
    stroke.progress.delete(trackedId);
    if (!twoEdges(st.enterEdge, exitEdge, st.c0, st.c1, proj.hull)) return null;
    return { mesh, c0: st.c0, c1: st.c1, chord: st.chord };
  }

  for (const mesh of live) {
    const proj = projectMeshHull(mesh, camera);
    if (!proj) continue;
    const fromOutside = !pointInConvexHull(a, proj.hull);
    const clipped = clipChordToHull(a, b, proj.hull);
    const insideB = pointInConvexHull(b, proj.hull);
    const entered = !!clipped || insideB;
    if (!entered) continue;

    if (!fromOutside) {
      const press = stroke.points[0] ?? a;
      const ranked = rankedHullEdges(press, proj.hull);
      const near = ranked[0];
      const second = ranked[1];
      if (!near) continue;
      const speed = segmentSpeedPxPerSec(a, b, dtSec);
      const fast = speed >= START.fastSpeed;
      const maxDist = fast ? START.fastDist : START.slowDist;
      if (near.dist > maxDist) continue;

      const corner =
        !!second &&
        second.dist <= maxDist &&
        second.dist - near.dist < START.slowClear;

      let c0 = near.point;
      let enterEdge = near.edge;

      if (corner) {
        if (chordLength(press, b) < START.cornerMove) continue;
        const hit = clipBackToEnter(a, b, proj.hull);
        if (!hit) continue;
        const backEdge = closestHullEdge(hit.c0, proj.hull);
        const row = ranked.find((r) => r.edge === backEdge);
        if (!row || row.dist > maxDist) continue;
        c0 = hit.c0;
        enterEdge = backEdge;
      } else if (fast) {
        const hit = clipBackToEnter(a, b, proj.hull);
        if (hit) {
          const backEdge = closestHullEdge(hit.c0, proj.hull);
          if (backEdge === near.edge) {
            c0 = hit.c0;
            enterEdge = backEdge;
          }
        }
      }

      stroke.progress.set(mesh.id, {
        c0,
        c1: b,
        chord: chordLength(c0, b),
        inside: true,
        enterEdge,
      });
      return null;
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
      clipped &&
      !insideB &&
      twoEdges(enterEdge, exitEdge, c0, c1, proj.hull)
    ) {
      return { mesh, c0, c1, chord };
    }

    stroke.progress.set(mesh.id, {
      c0,
      c1,
      chord,
      inside: true,
      enterEdge,
    });
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

  if (stroke.awaitBlank && !tipInAnyHull(meshes, camera, tip)) {
    stroke.awaitBlank = false;
  }

  const crack = crackAlongStroke(meshes, camera, stroke, tip, seg[0]);
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
        speed >= FLASH.minSpeed &&
        travelRatio >= FLASH.minTravelRatio;
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
  if (stroke.awaitBlank) phase = 'awaitBlank';
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
