import * as THREE from 'three';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../adapt/design';
import type { DesignPoint } from './slashInput';

const _ndc = new THREE.Vector2();
const _ray = new THREE.Raycaster();
const _n = new THREE.Vector3();
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _plane = new THREE.Plane();
const _wa = new THREE.Vector3();
const _wb = new THREE.Vector3();
const _wc = new THREE.Vector3();
const _h0 = new THREE.Vector3();
const _box = new THREE.Box3();
const _center = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _blade = new THREE.Vector3();

export function prepareCuttable(mesh: THREE.Mesh): void {
  mesh.userData.cuttable = true;
}

function designToRayPoint(
  p: DesignPoint,
  camera: THREE.Camera,
  distance: number,
  target: THREE.Vector3,
): void {
  _ndc.set((p.x / DESIGN_WIDTH) * 2 - 1, -(p.y / DESIGN_HEIGHT) * 2 + 1);
  _ray.setFromCamera(_ndc, camera);
  target.copy(_ray.ray.origin).addScaledVector(_ray.ray.direction, distance);
}

function forEachLocalTri(
  geometry: THREE.BufferGeometry,
  fn: (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => void,
): void {
  const pos = geometry.getAttribute('position');
  if (!pos) return;
  const index = geometry.getIndex();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const read = (i: number, t: THREE.Vector3) => t.fromBufferAttribute(pos, i);
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      read(index.getX(i), a);
      read(index.getX(i + 1), b);
      read(index.getX(i + 2), c);
      fn(a, b, c);
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      read(i, a);
      read(i + 1, b);
      read(i + 2, c);
      fn(a, b, c);
    }
  }
}

function pushTri(
  list: number[],
  p: THREE.Vector3,
  q: THREE.Vector3,
  r: THREE.Vector3,
): void {
  const cx = (q.y - p.y) * (r.z - p.z) - (q.z - p.z) * (r.y - p.y);
  const cy = (q.z - p.z) * (r.x - p.x) - (q.x - p.x) * (r.z - p.z);
  const cz = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  if (cx * cx + cy * cy + cz * cz < 1e-16) return;
  list.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
}

function intersect(
  p: THREE.Vector3,
  q: THREE.Vector3,
  dp: number,
  dq: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  const t = dp / (dp - dq);
  return target.copy(p).lerp(q, t);
}

function vkey(p: THREE.Vector3): string {
  return `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`;
}

function clipWorldTri(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  plane: THREE.Plane,
  eps: number,
  pos: number[],
  neg: number[],
  capSegs: [THREE.Vector3, THREE.Vector3][],
): void {
  const da = plane.distanceToPoint(a);
  const db = plane.distanceToPoint(b);
  const dc = plane.distanceToPoint(c);
  const ia = da > eps ? 1 : da < -eps ? -1 : 0;
  const ib = db > eps ? 1 : db < -eps ? -1 : 0;
  const ic = dc > eps ? 1 : dc < -eps ? -1 : 0;

  const pts = [a, b, c];
  const ds = [da, db, dc];
  const side = [ia, ib, ic];

  const hits: THREE.Vector3[] = [];
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    if (side[i] * side[j] === -1) {
      hits.push(intersect(pts[i], pts[j], ds[i], ds[j], _h0).clone());
    }
  }
  if (hits.length === 2) capSegs.push([hits[0], hits[1]]);

  if (ia >= 0 && ib >= 0 && ic >= 0) {
    pushTri(pos, a, b, c);
    if (ia <= 0 && ib <= 0 && ic <= 0) pushTri(neg, a, b, c);
    return;
  }
  if (ia <= 0 && ib <= 0 && ic <= 0) {
    pushTri(neg, a, b, c);
    return;
  }

  const clip = (keep: 1 | -1, out: number[]) => {
    const poly: THREE.Vector3[] = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      const pin = keep === 1 ? side[i] >= 0 : side[i] <= 0;
      const qin = keep === 1 ? side[j] >= 0 : side[j] <= 0;
      if (pin && qin) {
        poly.push(pts[j].clone());
      } else if (pin && !qin) {
        poly.push(intersect(pts[i], pts[j], ds[i], ds[j], _h0).clone());
      } else if (!pin && qin) {
        poly.push(intersect(pts[i], pts[j], ds[i], ds[j], _h0).clone());
        poly.push(pts[j].clone());
      }
    }
    for (let i = 1; i + 1 < poly.length; i++) {
      pushTri(out, poly[0], poly[i], poly[i + 1]);
    }
  };

  clip(1, pos);
  clip(-1, neg);
}

function capLoops(
  segs: [THREE.Vector3, THREE.Vector3][],
): THREE.Vector3[][] {
  const nodes = new Map<string, THREE.Vector3>();
  const adj = new Map<string, Set<string>>();
  const link = (p: THREE.Vector3, q: THREE.Vector3) => {
    const kp = vkey(p);
    const kq = vkey(q);
    if (kp === kq) return;
    nodes.set(kp, p);
    nodes.set(kq, q);
    if (!adj.has(kp)) adj.set(kp, new Set());
    if (!adj.has(kq)) adj.set(kq, new Set());
    adj.get(kp)!.add(kq);
    adj.get(kq)!.add(kp);
  };
  for (const [a, b] of segs) link(a, b);

  const used = new Set<string>();
  const loops: THREE.Vector3[][] = [];
  const ek = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  for (const start of adj.keys()) {
    for (const nb of adj.get(start)!) {
      const e0 = ek(start, nb);
      if (used.has(e0)) continue;
      const loop: string[] = [start];
      let prev = start;
      let cur = nb;
      used.add(e0);
      loop.push(cur);
      let guard = 0;
      while (cur !== start && guard++ < 4096) {
        const nbs = adj.get(cur);
        if (!nbs) break;
        let next: string | null = null;
        for (const k of nbs) {
          if (k === prev) continue;
          if (used.has(ek(cur, k))) continue;
          next = k;
          break;
        }
        if (!next) break;
        used.add(ek(cur, next));
        prev = cur;
        cur = next;
        if (cur === start) break;
        loop.push(cur);
      }
      if (loop.length >= 3) {
        loops.push(loop.map((k) => nodes.get(k)!));
      }
    }
  }
  return loops;
}

function addCap(
  loop: THREE.Vector3[],
  plane: THREE.Plane,
  pos: number[],
  neg: number[],
): void {
  if (loop.length < 3) return;
  const n = plane.normal;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % loop.length];
    nx += (p.y - q.y) * (p.z + q.z);
    ny += (p.z - q.z) * (p.x + q.x);
    nz += (p.x - q.x) * (p.y + q.y);
  }
  const pts = nx * n.x + ny * n.y + nz * n.z < 0 ? loop.slice().reverse() : loop;
  const o = pts[0];
  for (let i = 1; i + 1 < pts.length; i++) {
    pushTri(pos, o, pts[i], pts[i + 1]);
    pushTri(neg, o, pts[i + 1], pts[i]);
  }
}

function meshFromWorldTris(
  tris: number[],
  source: THREE.Mesh,
): THREE.Mesh | null {
  if (tris.length < 9) return null;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris), 3));
  geom.computeVertexNormals();
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  const srcMat = source.material;
  const mat = Array.isArray(srcMat)
    ? srcMat[0].clone()
    : (srcMat as THREE.Material).clone();
  mat.side = THREE.DoubleSide;
  const m = new THREE.Mesh(geom, mat);
  m.position.set(0, 0, 0);
  m.quaternion.identity();
  m.scale.set(1, 1, 1);
  m.userData.cuttable = true;
  return m;
}

function splitMeshByWorldPlane(
  mesh: THREE.Mesh,
  worldPlane: THREE.Plane,
): { a: THREE.Mesh; b: THREE.Mesh } | null {
  mesh.updateMatrixWorld(true);
  const pos: number[] = [];
  const neg: number[] = [];
  const capSegs: [THREE.Vector3, THREE.Vector3][] = [];
  const eps = 1e-5;
  const mw = mesh.matrixWorld;

  forEachLocalTri(mesh.geometry, (a, b, c) => {
    _wa.copy(a).applyMatrix4(mw);
    _wb.copy(b).applyMatrix4(mw);
    _wc.copy(c).applyMatrix4(mw);
    clipWorldTri(
      _wa.clone(),
      _wb.clone(),
      _wc.clone(),
      worldPlane,
      eps,
      pos,
      neg,
      capSegs,
    );
  });

  for (const loop of capLoops(capSegs)) {
    addCap(loop, worldPlane, pos, neg);
  }

  const pieceA = meshFromWorldTris(pos, mesh);
  const pieceB = meshFromWorldTris(neg, mesh);
  if (!pieceA || !pieceB) {
    pieceA?.geometry.dispose();
    pieceB?.geometry.dispose();
    return null;
  }
  return { a: pieceA, b: pieceB };
}

export function cutMeshBySlash(
  mesh: THREE.Mesh,
  camera: THREE.Camera,
  p0: DesignPoint,
  p1: DesignPoint,
): {
  a: THREE.Mesh;
  b: THREE.Mesh;
  normal: THREE.Vector3;
  bladeDir: THREE.Vector3;
  hitPoint: THREE.Vector3;
} | null {
  mesh.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  camera.getWorldPosition(_cam);

  _box.setFromObject(mesh);
  _box.getCenter(_center);
  const dist = Math.max(0.35, _cam.distanceTo(_center));
  designToRayPoint(p0, camera, dist, _pa);
  designToRayPoint(p1, camera, dist, _pb);
  if (_pa.distanceToSquared(_pb) < 1e-10) {
    _pb.addScaledVector(camera.up, 0.08);
  }

  camera.getWorldDirection(_fwd);
  _blade.subVectors(_pb, _pa);
  _n.crossVectors(_blade, _fwd);
  if (_n.lengthSq() < 1e-8) _n.crossVectors(_blade, camera.up);
  if (_n.lengthSq() < 1e-8) return null;
  _n.normalize();
  _plane.setFromNormalAndCoplanarPoint(_n, _pa);

  let split = splitMeshByWorldPlane(mesh, _plane);
  if (!split) {
    for (const k of [0.004, -0.004, 0.012, -0.012]) {
      const shifted = _plane.clone();
      shifted.constant -= k;
      split = splitMeshByWorldPlane(mesh, shifted);
      if (split) break;
    }
  }
  if (!split) return null;
  const bladeDir = _pb.clone().sub(_pa);
  if (bladeDir.lengthSq() < 1e-10) bladeDir.copy(camera.up);
  else bladeDir.normalize();
  const hitPoint = _pa.clone().add(_pb).multiplyScalar(0.5);
  return {
    a: split.a,
    b: split.b,
    normal: _n.clone(),
    bladeDir,
    hitPoint,
  };
}
