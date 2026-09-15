import * as THREE from 'three';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../adapt/design';
import type { DesignPoint } from './slashInput';
import {
  meshFromProfile,
  splitConvexPolygon,
  type Poly2,
} from './wood';

export { prepareCuttable } from './wood';

const _ndc = new THREE.Vector2();
const _ray = new THREE.Raycaster();
const _n = new THREE.Vector3();
const _plane = new THREE.Plane();
const _fwd = new THREE.Vector3();

function designToLocalXY(
  p: DesignPoint,
  camera: THREE.Camera,
  mesh: THREE.Mesh,
): Poly2 | null {
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);
  const origin = new THREE.Vector3();
  mesh.getWorldPosition(origin);
  _plane.setFromNormalAndCoplanarPoint(n, origin);
  _ndc.set((p.x / DESIGN_WIDTH) * 2 - 1, -(p.y / DESIGN_HEIGHT) * 2 + 1);
  _ray.setFromCamera(_ndc, camera);
  const hit = new THREE.Vector3();
  if (!_ray.ray.intersectPlane(_plane, hit)) return null;
  mesh.worldToLocal(hit);
  return { x: hit.x, y: hit.y };
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

  const profile = mesh.userData.profile as Poly2[] | undefined;
  const depth = mesh.userData.depth as number | undefined;
  if (!profile || profile.length < 3 || !depth) return null;

  const a = designToLocalXY(p0, camera, mesh);
  const b = designToLocalXY(p1, camera, mesh);
  if (!a || !b) return null;

  const parts = splitConvexPolygon(profile, a, b);
  if (!parts) return null;

  const pieceA = meshFromProfile(parts.pos, depth, mesh);
  const pieceB = meshFromProfile(parts.neg, depth, mesh);
  if (!pieceA || !pieceB) {
    pieceA?.geometry.dispose();
    pieceB?.geometry.dispose();
    return null;
  }

  const la = new THREE.Vector3(a.x, a.y, 0);
  const lb = new THREE.Vector3(b.x, b.y, 0);
  mesh.localToWorld(la);
  mesh.localToWorld(lb);
  const bladeDir = lb.clone().sub(la);
  if (bladeDir.lengthSq() < 1e-10) bladeDir.copy(camera.up);
  else bladeDir.normalize();
  const hitPoint = la.clone().add(lb).multiplyScalar(0.5);
  camera.getWorldDirection(_fwd);
  _n.crossVectors(bladeDir, _fwd);
  if (_n.lengthSq() < 1e-8) _n.copy(camera.up);
  else _n.normalize();

  return {
    a: pieceA,
    b: pieceB,
    normal: _n.clone(),
    bladeDir,
    hitPoint,
  };
}
