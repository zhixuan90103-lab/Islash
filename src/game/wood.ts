import * as THREE from 'three';
import { pieceVolume } from './bladeForce';
import { VIEW, WOOD, bevelInset, woodSize } from './design';
import { createWoodSolid } from './woodChamfer';
import {
  rectProfile,
  type Poly2,
} from './woodProfile';
import type { SlashPhysics } from './slashPhysics';

export type { Poly2 } from './woodProfile';
export {
  ensureCcw,
  rectProfile,
  splitConvexPolygon,
} from './woodProfile';

export function prepareCuttable(mesh: THREE.Mesh): void {
  mesh.userData.cuttable = true;
}

/** @deprecated 历史名，实际是竖挤 + 半平面内收倒角，不是锥台。 */
export function createFrustumGeometry(
  profile: Poly2[],
  depth: number,
  inset: number,
): THREE.BufferGeometry | null {
  return createWoodSolid(profile, depth, inset);
}

export function createWoodGeometry(
  width: number,
  height: number,
  depth: number,
): THREE.BufferGeometry {
  const geom = createWoodSolid(
    rectProfile(width, height),
    depth,
    bevelInset(depth),
  );
  if (!geom) {
    return new THREE.BoxGeometry(width, height, depth);
  }
  return geom;
}

export function meshFromProfile(
  profile: Poly2[],
  depth: number,
  source: THREE.Mesh,
): THREE.Mesh | null {
  const geom = createWoodSolid(profile, depth, bevelInset(depth));
  if (!geom) return null;
  const srcMat = source.material;
  const mat = Array.isArray(srcMat)
    ? srcMat[0].clone()
    : (srcMat as THREE.Material).clone();
  const m = new THREE.Mesh(geom, mat);
  m.position.copy(source.position);
  m.quaternion.copy(source.quaternion);
  m.scale.copy(source.scale);
  m.userData.cuttable = true;
  m.userData.profile = (geom.userData.profile as Poly2[] | undefined) ?? profile;
  m.userData.depth = depth;
  m.userData.originVolume = source.userData.originVolume;
  return m;
}

export type WoodSet = {
  cuttables: THREE.Mesh[];
  spawn: () => void;
  forget: (mesh: THREE.Mesh) => void;
  track: (mesh: THREE.Mesh) => void;
  dispose: () => void;
};

export function createWoodSet(
  scene: THREE.Scene,
  physics: SlashPhysics,
): WoodSet {
  const cuttables: THREE.Mesh[] = [];
  const spawned: THREE.Mesh[] = [];
  const mat = new THREE.MeshStandardMaterial({
    color: VIEW.woodColor,
    metalness: 0.04,
    roughness: 0.62,
    flatShading: true,
  });

  const forget = (mesh: THREE.Mesh) => {
    const i = cuttables.indexOf(mesh);
    if (i >= 0) cuttables.splice(i, 1);
    const si = spawned.indexOf(mesh);
    if (si >= 0) spawned.splice(si, 1);
  };

  const track = (mesh: THREE.Mesh) => {
    spawned.push(mesh);
  };

  const spawn = () => {
    for (const m of spawned) {
      physics.removeMesh(m);
      scene.remove(m);
      m.geometry.dispose();
    }
    spawned.length = 0;
    cuttables.length = 0;

    const size = woodSize();
    const mesh = new THREE.Mesh(
      createWoodGeometry(size.width, size.height, size.depth),
      mat,
    );
    mesh.position.set(0, WOOD.lift, 0);
    mesh.userData.profile = rectProfile(size.width, size.height);
    mesh.userData.depth = size.depth;
    mesh.userData.originVolume = pieceVolume(mesh);
    scene.add(mesh);
    prepareCuttable(mesh);
    physics.addMesh(mesh, 'staticBox');
    cuttables.push(mesh);
    spawned.push(mesh);
  };

  return {
    cuttables,
    spawn,
    forget,
    track,
    dispose: () => {
      for (const m of spawned) {
        physics.removeMesh(m);
        scene.remove(m);
        m.geometry.dispose();
      }
      spawned.length = 0;
      cuttables.length = 0;
      mat.dispose();
    },
  };
}
