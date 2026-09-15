import * as THREE from 'three';
import { VIEW, WOOD, woodSize } from './design';
import { prepareCuttable } from './slashCut';
import type { SlashPhysics } from './slashPhysics';

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
    metalness: 0.12,
    roughness: 0.4,
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
      new THREE.BoxGeometry(size.width, size.height, size.depth),
      mat,
    );
    mesh.position.set(0, WOOD.lift, 0);
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
