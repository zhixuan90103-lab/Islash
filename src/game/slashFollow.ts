import type * as THREE from 'three';
import { START } from './design';
import { pointInConvexHull, projectMeshHull } from './slashHit';
import type { DesignPoint, FollowThrough, SlashStroke } from './slashInput';

function hypot(dx: number, dy: number): number {
  return Math.hypot(dx, dy);
}

function signedDist(p: DesignPoint, f: FollowThrough): number {
  return (p.x - f.ox) * f.dy - (p.y - f.oy) * f.dx;
}

function distSeg(a: DesignPoint, b: DesignPoint, f: FollowThrough): number {
  const da = signedDist(a, f);
  const db = signedDist(b, f);
  if (da * db <= 0) return 0;
  return Math.min(Math.abs(da), Math.abs(db));
}

function heading(
  a: DesignPoint,
  b: DesignPoint,
): { ux: number; uy: number } | null {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const vl = hypot(vx, vy);
  if (vl < 1e-4) return null;
  return { ux: vx / vl, uy: vy / vl };
}

function along(h: { ux: number; uy: number }, f: FollowThrough): boolean {
  return h.ux * f.dx + h.uy * f.dy > START.alongMin;
}

function reverse(h: { ux: number; uy: number }, f: FollowThrough): boolean {
  return h.ux * f.dx + h.uy * f.dy < -0.15;
}

function tipOnFollowed(
  f: FollowThrough,
  tip: DesignPoint,
  meshes: THREE.Mesh[],
  camera: THREE.Camera,
): boolean {
  for (const id of [f.keepId, f.dropId]) {
    const mesh = meshes.find((m) => m.id === id);
    if (!mesh) continue;
    const proj = projectMeshHull(mesh, camera);
    if (proj && pointInConvexHull(tip, proj.hull)) return true;
  }
  return false;
}

/** 网格切开成功后开始余势：同一划的尾巴还是这一刀。 */
export function beginFollow(
  stroke: SlashStroke,
  c0: DesignPoint,
  c1: DesignPoint,
  keepId: number,
  dropId: number,
): void {
  const dx = c1.x - c0.x;
  const dy = c1.y - c0.y;
  const len = hypot(dx, dy);
  if (len < 1e-6) {
    stroke.follow = null;
    return;
  }
  stroke.follow = {
    ox: c0.x,
    oy: c0.y,
    dx: dx / len,
    dy: dy / len,
    keepId,
    dropId,
  };
}

/**
 * 这一段还在甩上一刀的尾巴：整段扫过走廊且方向仍顺着。
 */
export function followHolds(
  stroke: SlashStroke,
  from: DesignPoint,
  tip: DesignPoint,
): boolean {
  const f = stroke.follow;
  if (!f) return false;
  const h = heading(from, tip);
  if (distSeg(from, tip, f) > START.corridor) return false;
  if (!h) return true;
  return along(h, f);
}

export function followBlocks(
  stroke: SlashStroke,
  from: DesignPoint,
  tip: DesignPoint,
  meshes: THREE.Mesh[],
  camera: THREE.Camera,
): boolean {
  const f = stroke.follow;
  if (!f) return false;
  if (followHolds(stroke, from, tip)) return true;
  return tipOnFollowed(f, tip, meshes, camera);
}

/**
 * 刀尖还在刚切开的两块上，或仍顺着缝甩 → 拦住新刀。
 * 离开两块且不再顺着 → 结束余势，本段也不交刀（避免出尖角那一段贯穿）。
 * 折返 → 立刻结束，本段可切。
 */
export function stepFollow(
  stroke: SlashStroke,
  from: DesignPoint,
  tip: DesignPoint,
  meshes: THREE.Mesh[],
  camera: THREE.Camera,
): boolean {
  const f = stroke.follow;
  if (!f) return false;
  const h = heading(from, tip);
  if (h && distSeg(from, tip, f) <= START.corridor && reverse(h, f)) {
    stroke.follow = null;
    return false;
  }
  if (followBlocks(stroke, from, tip, meshes, camera)) return true;
  stroke.follow = null;
  return true;
}
