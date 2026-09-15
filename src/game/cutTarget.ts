import type * as THREE from 'three';
import {
  chordLength,
  clipBackToEnter,
  clipChordToHull,
  clipInfiniteLineToHull,
  closestHullEdge,
  pointInConvexHull,
  projectMeshHull,
} from './slashHit';
import type { DesignPoint, SlashStroke } from './slashInput';

export type CutTarget = {
  mesh: THREE.Mesh;
  c0: DesignPoint;
  c1: DesignPoint;
  chord: number;
};

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

function twoEdges(
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

/**
 * 滑出多边形时，只要进出落在两条不同轮廓边上就切。
 * 同一条边蹭进蹭出不算。切完须回空白再贯穿。
 */
export function resolveCutBySegment(
  meshes: THREE.Mesh[],
  camera: THREE.Camera,
  stroke: SlashStroke,
  seg: [DesignPoint, DesignPoint],
  skipIds: Set<number>,
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
    if (nowInside) return null;

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
    if (!fromOutside) continue;

    const inf = clipped
      ? null
      : clipInfiniteLineToHull(a, b, proj.hull);
    const c0 = clipped?.c0 ?? inf?.[0];
    if (!c0) continue;
    const c1 = clipped?.c1 ?? b;
    const enterEdge = clipped
      ? clipped.enterEdge
      : closestHullEdge(c0, proj.hull);
    const exitEdge = clipped ? clipped.exitEdge : -1;
    const chord = clipped ? chordLength(c0, c1) : 0;

    // 这一段已经从另一边穿出：立刻切。
    if (fromOutside && clipped && !insideB && twoEdges(enterEdge, exitEdge, c0, c1, proj.hull)) {
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

/**
 * 已进板时，沿入点→刀尖外推整条贯穿弦。进出同边则不算意图，不画刀光。
 */
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

/** 夹缝：入点 → 当前刀尖，裁在凸包内。切完仍在块内时也能跟手。 */
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
