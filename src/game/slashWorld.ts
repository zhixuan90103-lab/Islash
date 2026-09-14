import * as THREE from 'three';
import { cutMeshBySlash, prepareCuttable } from './slashCut';
import { createSlashOverlay, type DebugHit } from './slashDebug';
import {
  clipPolylineToHull,
  pointInConvexHull,
  projectMeshHull,
  strokeHitsMesh,
  throughThreshold,
} from './slashHit';
import { createSlashInput, type DesignPoint, type SlashStroke } from './slashInput';
import { createSlashPhysics } from './slashPhysics';
import type { StageLayout } from '../adapt/design';

export type SlashSession = {
  step: (dt: number) => void;
  dispose: () => void;
};

export async function mountSlashWorld(
  stage: HTMLElement,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  getLayout: () => StageLayout | null,
): Promise<SlashSession> {
  const physics = await createSlashPhysics();
  const overlay = createSlashOverlay(stage);
  const cuttables: THREE.Mesh[] = [];

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.2, 8),
    new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.05,
      roughness: 0.9,
    }),
  );
  floor.position.y = -0.1;
  scene.add(floor);
  physics.addMesh(floor, 'staticBox');

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 1.1, 1.1),
    new THREE.MeshStandardMaterial({
      color: 0x7c3aed,
      metalness: 0.12,
      roughness: 0.4,
    }),
  );
  mesh.position.set(0, 1.35, 0);
  scene.add(mesh);
  prepareCuttable(mesh);
  physics.addMesh(mesh, 'staticBox');
  cuttables.push(mesh);

  const pieceVolume = (m: THREE.Mesh) => {
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox;
    if (!bb) return 0;
    const s = bb.getSize(new THREE.Vector3());
    return Math.max(0, s.x * s.y * s.z);
  };

  const replaceCut = (old: THREE.Mesh, a: THREE.Mesh, b: THREE.Mesh) => {
    physics.removeMesh(old);
    scene.remove(old);
    old.geometry.dispose();
    const i = cuttables.indexOf(old);
    if (i >= 0) cuttables.splice(i, 1);

    const keep = pieceVolume(a) >= pieceVolume(b) ? a : b;
    const drop = keep === a ? b : a;

    scene.add(keep);
    prepareCuttable(keep);
    physics.addMesh(keep, 'staticConvex');
    cuttables.push(keep);

    scene.add(drop);
    prepareCuttable(drop);
    physics.addMesh(drop, 'convex');
    cuttables.push(drop);
  };

  const tryCut = (stroke: SlashStroke, phase: 'move' | 'end') => {
    if (stroke.cutDone || stroke.points.length < 2) return;

    let best: {
      mesh: THREE.Mesh;
      chord: number;
      c0: DesignPoint;
      c1: DesignPoint;
    } | null = null;
    const hits: DebugHit[] = [];
    const tip = stroke.points[stroke.points.length - 1];

    for (const mesh of cuttables) {
      const proj = projectMeshHull(mesh, camera);
      if (!proj) continue;
      const rayHits = strokeHitsMesh(mesh, camera, stroke.points);
      const clipped = clipPolylineToHull(stroke.points, proj.hull);
      let c0: DesignPoint | null = null;
      let c1: DesignPoint | null = null;
      let chord = 0;
      if (rayHits.length >= 2) {
        c0 = rayHits[0];
        c1 = rayHits[rayHits.length - 1];
        chord = Math.hypot(c1.x - c0.x, c1.y - c0.y);
      } else if (clipped) {
        c0 = clipped.c0;
        c1 = clipped.c1;
        chord = clipped.length;
      }
      const thr = throughThreshold(proj.box);
      const overlapping = chord >= thr && c0 && c1;
      const tipOnMesh =
        rayHits.length > 0 &&
        (pointInConvexHull(tip, proj.hull) ||
          (rayHits[rayHits.length - 1] === tip ||
            (c1 !== null && Math.hypot(tip.x - c1.x, tip.y - c1.y) < 8)));
      hits.push({ hull: proj.hull, through: !!overlapping });
      if (!overlapping || !c0 || !c1) continue;
      const committed = phase === 'end' || !tipOnMesh;
      if (committed && (!best || chord > best.chord)) {
        best = { mesh, chord, c0, c1 };
      }
    }

    overlay.draw(stroke.points, hits);
    if (!best) return;

    camera.updateMatrixWorld(true);
    const result = cutMeshBySlash(best.mesh, camera, best.c0, best.c1);
    if (!result) return;
    stroke.cutDone = true;
    replaceCut(best.mesh, result.a, result.b);
  };

  const input = createSlashInput(stage, getLayout, {
    onStroke: (stroke) => overlay.draw(stroke.points, []),
    onMove: (stroke) => tryCut(stroke, 'move'),
    onEnd: (stroke) => {
      if (stroke) tryCut(stroke, 'end');
      if (stroke) overlay.draw(stroke.points, []);
    },
  });

  return {
    step: (dt) => physics.step(dt),
    dispose: () => {
      input.dispose();
      overlay.canvas.remove();
      physics.dispose();
    },
  };
}
