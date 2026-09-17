import * as THREE from 'three';
import type { DesignPoint } from './slashInput';
import { designToLocalXY } from './slashHit';
import {
  meshFromProfile,
  splitConvexPolygon,
  type Poly2,
} from './wood';

export { prepareCuttable } from './wood';

const _n = new THREE.Vector3();
const _fwd = new THREE.Vector3();

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
