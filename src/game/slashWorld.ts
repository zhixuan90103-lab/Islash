import * as THREE from 'three';
import { applyBladeImpulse, pieceVolume } from './bladeForce';
import { crackAlongStroke, previewCutChord, resolveCutBySegment } from './cutTarget';
import {
  headingAngleDeg,
  resetSlashIntent,
  updateSlashIntent,
} from './slashIntent';
import { mountSlashDebugPanel } from './slashDebugPanel';
import { createSlashOverlay } from './slashDebug';
import { cutMeshBySlash, prepareCuttable } from './slashCut';
import {
  createSlashInput,
  segmentSpeedPxPerSec,
  type DesignPoint,
  type SlashStroke,
} from './slashInput';
import { createSlashPhysics } from './slashPhysics';
import { FLASH } from './design';
import { createWoodSet } from './wood';
import type { StageLayout } from '../adapt/design';

export type SlashSession = {
  step: (dt: number) => void;
  dispose: () => void;
};

function report(msg: string): void {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
}

export async function mountSlashWorld(
  stage: HTMLElement,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  getLayout: () => StageLayout | null,
): Promise<SlashSession> {
  const physics = await createSlashPhysics();
  const overlay = createSlashOverlay(stage);
  const wood = createWoodSet(scene, physics);
  wood.spawn();
  let lastGeom: { c0: DesignPoint; c1: DesignPoint } | null = null;
  let lastLocked: { c0: DesignPoint; c1: DesignPoint } | null = null;
  let lastCommit: { c0: DesignPoint; c1: DesignPoint } | null = null;
  let flashHot = false;
  let earlyFlashed = false;
  let aimStable = 0;

  const pushIntentDebug = (stroke: SlashStroke) => {
    overlay.setIntentDebug({
      geom: lastGeom,
      locked: lastLocked,
      commit: lastCommit,
      stable: stroke.intent.stable,
      lockedFlag: stroke.intent.locked,
    });
  };

  const replaceCut = (
    old: THREE.Mesh,
    a: THREE.Mesh,
    b: THREE.Mesh,
    bladeDir: THREE.Vector3,
    hitPoint: THREE.Vector3,
    speedPx: number,
  ): { keep: THREE.Mesh; drop: THREE.Mesh } => {
    physics.removeMesh(old);
    scene.remove(old);
    old.geometry.dispose();
    wood.forget(old);

    const keep = pieceVolume(a) >= pieceVolume(b) ? a : b;
    const drop = keep === a ? b : a;

    scene.add(keep);
    prepareCuttable(keep);
    physics.addMesh(keep, 'staticConvex');
    wood.cuttables.push(keep);
    wood.track(keep);

    scene.add(drop);
    prepareCuttable(drop);
    const rec = physics.addMesh(drop, 'convex');
    wood.track(drop);

    applyBladeImpulse(
      rec.body,
      camera,
      keep,
      drop,
      bladeDir,
      hitPoint,
      speedPx,
    );
    return { keep, drop };
  };

  const tryCutSeg = (
    stroke: SlashStroke,
    seg: [DesignPoint, DesignPoint],
    dtSec: number,
  ) => {
    const born = new Set<number>();
    const snapshot = wood.cuttables.slice();
    const best = resolveCutBySegment(
      snapshot,
      camera,
      stroke,
      seg,
      born,
      dtSec,
    );
    if (!best) return false;
    camera.updateMatrixWorld(true);
    const result = cutMeshBySlash(best.mesh, camera, best.c0, best.c1);
    if (!result) {
      report('碰到了但切开失败');
      return false;
    }
    stroke.slicedIds.add(best.mesh.id);
    stroke.progress.clear();
    resetSlashIntent(stroke);
    stroke.awaitBlank = true;
    const speedPx = Math.max(
      segmentSpeedPxPerSec(seg[0], seg[1], dtSec),
      80,
    );
    const { keep, drop } = replaceCut(
      best.mesh,
      result.a,
      result.b,
      result.bladeDir,
      result.hitPoint,
      speedPx,
    );
    born.add(keep.id);
    born.add(drop.id);
    lastCommit = { c0: best.c0, c1: best.c1 };
    overlay.freezeFlash();
    if (!earlyFlashed) overlay.flash(best.c0, best.c1, false);
    earlyFlashed = false;
    flashHot = false;
    aimStable = 0;
    pushIntentDebug(stroke);
    report('已切开');
    return true;
  };

  const uiRoot = document.getElementById('ui-root');
  const panel = uiRoot
    ? mountSlashDebugPanel(uiRoot, {
        onWoodChange: () => wood.spawn(),
        onGravityChange: (y) => physics.setGravityY(y),
      })
    : { dispose: () => {} };

  const input = createSlashInput(stage, getLayout, {
    onStroke: (stroke) => {
      const tip = stroke.points[stroke.points.length - 1];
      if (stroke.points.length === 1) {
        lastGeom = null;
        lastLocked = null;
        lastCommit = null;
        flashHot = false;
        earlyFlashed = false;
        aimStable = 0;
        overlay.begin();
      }
      if (tip) overlay.push(tip);
    },
    onPredicted: (points) => {
      overlay.setPredicted(points);
    },
    onMove: (stroke, lastSeg, dtSec) => {
      overlay.push(lastSeg[1]);
      const cut = tryCutSeg(stroke, lastSeg, dtSec);
      const crack = crackAlongStroke(
        wood.cuttables,
        camera,
        stroke,
        lastSeg[1],
        lastSeg[0],
      );
      if (crack) overlay.setCrack(crack.c0, crack.c1);
      else overlay.setCrack(null);
      if (!cut) {
        const geom = previewCutChord(
          wood.cuttables,
          camera,
          stroke,
          lastSeg[1],
        );
        const locked = updateSlashIntent(stroke, geom, lastSeg, dtSec);
        lastGeom = geom;
        lastLocked = locked;
        const speed = segmentSpeedPxPerSec(lastSeg[0], lastSeg[1], dtSec);
        if (locked) {
          const ang = headingAngleDeg(
            lastSeg[1].x - lastSeg[0].x,
            lastSeg[1].y - lastSeg[0].y,
            locked.c1.x - locked.c0.x,
            locked.c1.y - locked.c0.y,
          );
          if (ang <= FLASH.aimAngle) aimStable += 1;
          else aimStable = 0;
          const cyan = geom ?? locked;
          const ax = cyan.c1.x - cyan.c0.x;
          const ay = cyan.c1.y - cyan.c0.y;
          const full = Math.hypot(ax, ay) || 1;
          const traveled =
            ((lastSeg[1].x - cyan.c0.x) * ax + (lastSeg[1].y - cyan.c0.y) * ay) /
            full;
          const nearExit = traveled / full >= FLASH.minTravelRatio;
          const aimed =
            aimStable >= FLASH.aimSegs &&
            speed >= FLASH.minSpeed &&
            nearExit;
          if (aimed) flashHot = true;
        } else {
          flashHot = false;
          aimStable = 0;
        }
        if (locked && flashHot && !earlyFlashed) {
          earlyFlashed = true;
          const chord = crack ?? locked;
          overlay.flash(chord.c0, chord.c1, true);
        }
        overlay.setPreview(null);
        pushIntentDebug(stroke);
      }
    },
    onEnd: (stroke) => {
      if (stroke && stroke.slicedIds.size === 0) {
        report('划过但未贯穿木板');
      }
      overlay.setPredicted([]);
      overlay.end();
    },
  });

  return {
    step: (dt) => {
      physics.step(dt);
      overlay.step();
    },
    dispose: () => {
      input.dispose();
      panel.dispose();
      overlay.canvas.remove();
      wood.dispose();
      physics.dispose();
    },
  };
}
