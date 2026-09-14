import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../adapt/design';
import type { DesignPoint } from './slashInput';

const _ndc = new THREE.Vector2();
const _ray = new THREE.Raycaster();
const _n = new THREE.Vector3();
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _plane = new THREE.Plane();
const _inv = new THREE.Matrix4();
const _localPlane = new THREE.Plane();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _hit = new THREE.Vector3();

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

function forEachTriangle(
  geometry: THREE.BufferGeometry,
  fn: (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => void,
): void {
  const pos = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const read = (i: number, t: THREE.Vector3) => t.fromBufferAttribute(pos, i);
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      read(index.getX(i), _a);
      read(index.getX(i + 1), _b);
      read(index.getX(i + 2), _c);
      fn(_a, _b, _c);
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      read(i, _a);
      read(i + 1, _b);
      read(i + 2, _c);
      fn(_a, _b, _c);
    }
  }
}

function pushUnique(list: THREE.Vector3[], p: THREE.Vector3, eps = 1e-5): void {
  for (const q of list) {
    if (q.distanceToSquared(p) < eps * eps) return;
  }
  list.push(p.clone());
}

function clipEdge(
  pa: THREE.Vector3,
  pb: THREE.Vector3,
  da: number,
  db: number,
  eps: number,
  sidePos: THREE.Vector3[],
  sideNeg: THREE.Vector3[],
): void {
  if (da >= -eps) pushUnique(sidePos, pa);
  if (da <= eps) pushUnique(sideNeg, pa);
  if (db >= -eps) pushUnique(sidePos, pb);
  if (db <= eps) pushUnique(sideNeg, pb);
  if (da * db < 0 && Math.abs(da - db) > eps) {
    const t = da / (da - db);
    _hit.copy(pa).lerp(pb, t);
    pushUnique(sidePos, _hit);
    pushUnique(sideNeg, _hit);
  }
}

function meshFromPoints(
  points: THREE.Vector3[],
  source: THREE.Mesh,
): THREE.Mesh | null {
  if (points.length < 3) return null;
  const cm = new THREE.Vector3();
  for (const p of points) cm.add(p);
  cm.divideScalar(points.length);
  const centered = points.map((p) => p.clone().sub(cm));
  let geom: THREE.BufferGeometry;
  try {
    geom = new ConvexGeometry(centered);
  } catch {
    return null;
  }
  if (!geom.getAttribute('position') || geom.getAttribute('position').count < 4) {
    geom.dispose();
    return null;
  }
  const m = new THREE.Mesh(geom, source.material);
  source.localToWorld(cm);
  m.position.copy(cm);
  m.quaternion.copy(source.getWorldQuaternion(new THREE.Quaternion()));
  m.userData.cuttable = true;
  return m;
}

function splitMeshByPlane(
  mesh: THREE.Mesh,
  worldPlane: THREE.Plane,
): { a: THREE.Mesh; b: THREE.Mesh } | null {
  _inv.copy(mesh.matrixWorld).invert();
  _localPlane.copy(worldPlane).applyMatrix4(_inv);

  const sidePos: THREE.Vector3[] = [];
  const sideNeg: THREE.Vector3[] = [];
  const eps = 1e-4;

  forEachTriangle(mesh.geometry, (a, b, c) => {
    const da = _localPlane.distanceToPoint(a);
    const db = _localPlane.distanceToPoint(b);
    const dc = _localPlane.distanceToPoint(c);
    clipEdge(a, b, da, db, eps, sidePos, sideNeg);
    clipEdge(b, c, db, dc, eps, sidePos, sideNeg);
    clipEdge(c, a, dc, da, eps, sidePos, sideNeg);
  });

  const pieceA = meshFromPoints(sidePos, mesh);
  const pieceB = meshFromPoints(sideNeg, mesh);
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
): { a: THREE.Mesh; b: THREE.Mesh; normal: THREE.Vector3 } | null {
  mesh.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  camera.getWorldPosition(_cam);

  const dist = Math.max(0.5, _cam.distanceTo(mesh.position));
  designToRayPoint(p0, camera, dist, _pa);
  designToRayPoint(p1, camera, dist, _pb);
  if (_pa.distanceToSquared(_pb) < 1e-8) return null;

  _plane.setFromCoplanarPoints(_cam, _pa, _pb);
  _n.copy(_plane.normal);
  if (_n.lengthSq() < 1e-8) return null;

  let split = splitMeshByPlane(mesh, _plane);
  if (!split) {
    const center = new THREE.Vector3();
    mesh.getWorldPosition(center);
    const shifted = _plane.clone();
    const d = shifted.distanceToPoint(center);
    if (Math.abs(d) < 0.02) {
      shifted.constant -= Math.sign(d || 1) * 0.01;
      split = splitMeshByPlane(mesh, shifted);
    }
  }
  if (!split) return null;
  return { a: split.a, b: split.b, normal: _n.clone() };
}
