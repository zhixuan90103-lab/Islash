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

function cruiseSpeed(stroke: SlashStroke): number {
  const s = stroke.intent.speedSamples;
  if (s.length === 0) return 0;
  const a = s.slice().sort((x, y) => x - y);
  return a[(a.length - 1) >> 1];
}

/** 从 end 往回走 span 像素，取这段航向。 */
function windowHeading(
  pts: DesignPoint[],
  end: number,
  span: number,
): { i: number; ux: number; uy: number } | null {
  if (end <= 0) return null;
  let acc = 0;
  let i = end;
  while (i > 0 && acc < span) {
    i -= 1;
    acc += hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  }
  if (acc < span * 0.55) return null;
  const h = heading(pts[i], pts[end]);
  return h ? { i, ux: h.ux, uy: h.uy } : null;
}

/**
 * 局部尖角：短距离里折得很陡。弧线会转方向但局部夹角小。
 * 中等尖角还要刀速掉一截（人拐弯会减速）；接近折返则不要求。
 */
export function isLocalCorner(
  stroke: SlashStroke,
  from: DesignPoint,
  tip: DesignPoint,
  dtSec: number,
): boolean {
  const raw = stroke.points;
  const pts =
    raw.length > 0 &&
    hypot(raw[raw.length - 1].x - tip.x, raw[raw.length - 1].y - tip.y) < 0.5
      ? raw
      : raw.concat([tip]);
  const end = pts.length - 1;
  const span = Math.max(12, START.cornerSpan);
  const recent = windowHeading(pts, end, span);
  if (!recent) return false;
  const prev = windowHeading(pts, recent.i, span);
  if (!prev) return false;
  const dot = recent.ux * prev.ux + recent.uy * prev.uy;
  if (dot > START.cornerDot) return false;
  if (dot <= START.cornerFlip) return true;
  const now = hypot(tip.x - from.x, tip.y - from.y) / Math.max(1e-4, dtSec);
  const cruise = cruiseSpeed(stroke);
  if (cruise < 40) return true;
  return now <= cruise * START.cornerSlow;
}

function tipOnKeep(
  f: FollowThrough,
  tip: DesignPoint,
  meshes: THREE.Mesh[],
  camera: THREE.Camera,
): boolean {
  const mesh = meshes.find((m) => m.id === f.keepId);
  if (!mesh) return false;
  const proj = projectMeshHull(mesh, camera);
  return !!(proj && pointInConvexHull(tip, proj.hull));
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
  return tipOnKeep(f, tip, meshes, camera);
}

/**
 * 刀尖还在留下块上，或仍顺着缝 → 拦住新刀（不锁新 A）。
 * 短距离尖角（不是弧线累积转角）→ 结束余势，本段不切，之后可锁新 A。
 * 离开留下块且不再顺着 → 结束余势，本段也不交刀。
 */
export function stepFollow(
  stroke: SlashStroke,
  from: DesignPoint,
  tip: DesignPoint,
  meshes: THREE.Mesh[],
  camera: THREE.Camera,
  dtSec = 1 / 60,
): boolean {
  const f = stroke.follow;
  if (!f) return false;
  if (followBlocks(stroke, from, tip, meshes, camera)) {
    if (isLocalCorner(stroke, from, tip, dtSec)) {
      stroke.follow = null;
      return true;
    }
    return true;
  }
  stroke.follow = null;
  return true;
}
