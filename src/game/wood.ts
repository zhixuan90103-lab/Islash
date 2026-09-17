import * as THREE from 'three';
import { pieceVolume } from './bladeForce';
import { CUT, VIEW, WOOD, bevelInset, viewHalfH, woodSize } from './design';
import woodGrainUrl from '../assets/wood-grain.jpg';
import { createWoodSolid } from './woodChamfer';
import {
  catalogBoardProfile,
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
  mesh.castShadow = true;
  mesh.receiveShadow = false;
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
    ? srcMat.map((m) => m.clone())
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
  spawn: (next?: boolean) => void;
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
  const grain = new THREE.TextureLoader().load(woodGrainUrl);
  grain.wrapS = THREE.ClampToEdgeWrapping;
  grain.wrapT = THREE.ClampToEdgeWrapping;
  grain.colorSpace = THREE.SRGBColorSpace;
  grain.anisotropy = 4;
  const lambert = (color: number) =>
    new THREE.MeshLambertMaterial({
      color,
      map: grain,
      emissive: 0x000000,
      specularMap: null,
      envMap: null,
      reflectivity: 0,
    });
  const matFace = lambert(WOOD.faceColor);
  const matEdge = lambert(VIEW.woodChamfer);
  const mat = [matFace, matEdge];

  const forget = (mesh: THREE.Mesh) => {
    const i = cuttables.indexOf(mesh);
    if (i >= 0) cuttables.splice(i, 1);
    const si = spawned.indexOf(mesh);
    if (si >= 0) spawned.splice(si, 1);
  };

  const track = (mesh: THREE.Mesh) => {
    spawned.push(mesh);
  };

  let lastShape = -1;

  const spawn = (_next = false) => {
    for (const m of spawned) {
      physics.removeMesh(m);
      scene.remove(m);
      m.geometry.dispose();
    }
    spawned.length = 0;
    cuttables.length = 0;

    const size = woodSize();
    const targetArea = size.width * size.height;
    const picked = catalogBoardProfile(
      targetArea,
      CUT.boardMaxW,
      CUT.boardMaxH,
      lastShape,
    );
    const profile = picked.profile;
    lastShape = picked.index;
    const geom =
      createWoodSolid(profile, size.depth, bevelInset(size.depth)) ??
      createWoodGeometry(size.width, size.height, size.depth);
    const mesh = new THREE.Mesh(geom, mat);
    geom.computeBoundingBox();
    const bb = geom.boundingBox;
    const minY = bb ? bb.min.y : 0;
    mesh.position.set(0, viewHalfH() + CUT.enterPad - minY, 0);
    mesh.userData.profile =
      (geom.userData.profile as Poly2[] | undefined) ?? profile;
    mesh.userData.depth = size.depth;
    mesh.userData.originVolume = pieceVolume(mesh);
    scene.add(mesh);
    prepareCuttable(mesh);
    physics.addMesh(mesh, 'staticConvex');
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
      for (const m of mat) m.dispose();
    },
  };
}
