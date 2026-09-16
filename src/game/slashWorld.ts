import * as THREE from 'three';
import { applyBladeImpulse, pieceVolume } from './bladeForce';
import { CUT, FINALE, FX, SHAKE } from './design';
import { createScreenShake, cutHit } from './screenShake';
import type { PhysBody } from './slashPhysics';
import {
  consumeCutLine,
  crackAlongStroke,
  resetSlashIntent,
  stepSlashIntent,
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
import { createWoodSet } from './wood';
import type { StageLayout } from '../adapt/design';

export type SlashSession = {
  step: (dt: number) => void;
  applyView: () => void;
  restoreView: () => void;
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
  const shake = createScreenShake(camera);
  const wood = createWoodSet(scene, physics);
  wood.spawn();
  let lastCommit: { c0: DesignPoint; c1: DesignPoint } | null = null;
  const pendingFly: {
    rec: PhysBody;
    recKeep?: PhysBody;
    keep: THREE.Mesh;
    drop: THREE.Mesh;
    bladeDir: THREE.Vector3;
    hitPoint: THREE.Vector3;
    speedPx: number;
    squeeze: THREE.Vector3;
    keepRest: THREE.Vector3;
    dropRest: THREE.Vector3;
    freezeLeft: number;
    hit: number;
    dir: THREE.Vector3;
    finish: boolean;
    chord: { c0: DesignPoint; c1: DesignPoint };
  }[] = [];
  const _squeezeN = new THREE.Vector3();
  const _zero = { x: 0, y: 0, z: 0 };
  let slowLeft = 0;

  const replaceCut = (
    old: THREE.Mesh,
    a: THREE.Mesh,
    b: THREE.Mesh,
    finish: boolean,
  ): {
    keep: THREE.Mesh;
    drop: THREE.Mesh;
    rec: PhysBody;
    recKeep?: PhysBody;
  } => {
    physics.removeMesh(old);
    scene.remove(old);
    old.geometry.dispose();
    wood.forget(old);

    const keep = pieceVolume(a) >= pieceVolume(b) ? a : b;
    const drop = keep === a ? b : a;

    scene.add(keep);
    prepareCuttable(keep);
    let recKeep: PhysBody | undefined;
    if (finish) {
      recKeep = physics.addMesh(keep, 'convex');
      wood.track(keep);
    } else {
      physics.addMesh(keep, 'staticConvex');
      wood.cuttables.push(keep);
      wood.track(keep);
    }

    scene.add(drop);
    prepareCuttable(drop);
    const rec = physics.addMesh(drop, 'convex');
    wood.track(drop);

    return { keep, drop, rec, recKeep };
  };

  const pinBody = (
    rec: PhysBody,
    rest: THREE.Vector3,
  ) => {
    const b = rec.body;
    b.setGravityScale(0, true);
    b.setLinvel(_zero, true);
    b.setAngvel(_zero, true);
    b.setTranslation(rest, true);
  };

  const pinDrop = (p: (typeof pendingFly)[number]) => {
    pinBody(p.rec, p.dropRest);
    if (p.recKeep) pinBody(p.recKeep, p.keepRest);
  };

  const releaseCut = (p: (typeof pendingFly)[number]) => {
    p.rec.body.setGravityScale(1, true);
    p.keep.position.copy(p.keepRest);
    p.drop.position.copy(p.dropRest);
    const burst = p.finish ? FX.burst * FINALE.burst : FX.burst;
    applyBladeImpulse(
      p.rec.body,
      camera,
      p.keep,
      p.drop,
      p.bladeDir,
      p.hitPoint,
      p.speedPx,
      burst,
    );
    if (p.recKeep) {
      p.recKeep.body.setGravityScale(1, true);
      applyBladeImpulse(
        p.recKeep.body,
        camera,
        p.drop,
        p.keep,
        p.bladeDir,
        p.hitPoint,
        p.speedPx,
        burst,
      );
    }
    shake.hit(p.hit, p.dir, p.finish ? FINALE.kickMul : 1);
    if (p.finish) slowLeft = 0;
  };

  const applyCommit = (
    stroke: SlashStroke,
    seg: [DesignPoint, DesignPoint],
    dtSec: number,
    commit: {
      mesh: THREE.Mesh;
      c0: DesignPoint;
      c1: DesignPoint;
    },
    commitFlash: boolean,
    crack: { c0: DesignPoint; c1: DesignPoint } | null,
  ): boolean => {
    camera.updateMatrixWorld(true);
    const result = cutMeshBySlash(commit.mesh, camera, commit.c0, commit.c1);
    if (!result) {
      report('碰到了但切开失败');
      return false;
    }
    stroke.slicedIds.add(commit.mesh.id);
    stroke.progress.clear();
    resetSlashIntent(stroke);
    const speedPx = Math.max(
      segmentSpeedPxPerSec(seg[0], seg[1], dtSec),
      80,
    );
    const volA = pieceVolume(result.a);
    const volB = pieceVolume(result.b);
    const dropVol = Math.min(volA, volB);
    const keepVol = Math.max(volA, volB);
    const originVol =
      Number(commit.mesh.userData.originVolume) || volA + volB;
    const finish = keepVol < originVol * CUT.finishRemain;
    const pieces = replaceCut(commit.mesh, result.a, result.b, finish);
    const hit = cutHit(speedPx, dropVol, keepVol);
    const freeze = finish
      ? FINALE.freeze
      : SHAKE.freezeMin + hit * (SHAKE.freezeMax - SHAKE.freezeMin);
    _squeezeN.subVectors(pieces.drop.position, pieces.keep.position);
    if (_squeezeN.lengthSq() < 1e-10) _squeezeN.copy(result.normal);
    _squeezeN.normalize();
    const sq = new THREE.Vector3();
    const keepRest = pieces.keep.position.clone();
    const dropRest = pieces.drop.position.clone();
    if (freeze > 1e-4) {
      sq.copy(_squeezeN).multiplyScalar(FX.squeeze * (0.45 + 0.55 * hit));
      pieces.keep.position.add(sq);
      pieces.drop.position.addScaledVector(sq, -1);
    }
    const pending = {
      rec: pieces.rec,
      recKeep: pieces.recKeep,
      keep: pieces.keep,
      drop: pieces.drop,
      bladeDir: result.bladeDir.clone(),
      hitPoint: result.hitPoint.clone(),
      speedPx,
      squeeze: sq,
      keepRest,
      dropRest,
      freezeLeft: freeze,
      hit,
      dir: result.bladeDir.clone(),
      finish,
      chord: { c0: commit.c0, c1: commit.c1 },
    };
    overlay.burstChips(commit.c0, commit.c1, hit);
    if (finish) {
      overlay.finaleFlash(commit.c0, commit.c1);
      if (freeze > 1e-4) slowLeft = freeze;
    } else overlay.impactFlash(hit);
    if (freeze <= 1e-4) {
      releaseCut(pending);
    } else {
      pinDrop(pending);
      pendingFly.push(pending);
    }
    lastCommit = { c0: commit.c0, c1: commit.c1 };
    consumeCutLine(stroke, commit.c0, commit.c1);
    const crack2 =
      crackAlongStroke(
        wood.cuttables,
        camera,
        stroke,
        seg[1],
        seg[0],
      ) ?? crack;
    if (crack2) overlay.setCrack(crack2.c0, crack2.c1);
    else overlay.setCrack(null);
    overlay.freezeFlash();
    if (!finish && commitFlash) overlay.flash(commit.c0, commit.c1, false);
    report(finish ? '完成切割' : '已切开');
    return true;
  };

  const uiRoot = document.getElementById('ui-root');
  const panel = uiRoot
    ? mountSlashDebugPanel(uiRoot, {
        onWoodChange: () => {
          wood.spawn();
          slowLeft = 0;
        },
        onGravityChange: (y) => physics.setGravityY(y),
      })
    : { dispose: () => {} };

  const input = createSlashInput(stage, getLayout, {
    onStroke: (stroke) => {
      const tip = stroke.points[stroke.points.length - 1];
      if (stroke.points.length === 1) {
        lastCommit = null;
        overlay.begin();
      }
      if (tip) overlay.push(tip);
    },
    onPredicted: (points) => {
      overlay.setPredicted(points);
    },
    onMove: (stroke, lastSeg, dtSec) => {
      const frame = stepSlashIntent(
        wood.cuttables.slice(),
        camera,
        stroke,
        lastSeg,
        new Set(),
        dtSec,
      );
      if (frame.crack) overlay.setCrack(frame.crack.c0, frame.crack.c1);
      else overlay.setCrack(null);
      if (frame.commit) {
        applyCommit(
          stroke,
          lastSeg,
          dtSec,
          frame.commit,
          frame.commitFlash,
          frame.crack,
        );
      } else if (frame.earlyFlash) {
        const chord = frame.crack ?? frame.cyan;
        if (chord) overlay.flash(chord.c0, chord.c1, true);
      }
      overlay.setPreview(null);
      overlay.setIntentDebug({
        geom: frame.cyan,
        locked:
          frame.locked && stroke.intent.c0 && stroke.intent.c1
            ? { c0: stroke.intent.c0, c1: stroke.intent.c1 }
            : null,
        commit: lastCommit,
        stable: stroke.intent.stable,
        lockedFlag: frame.locked,
      });
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
      overlay.step();
      for (let i = pendingFly.length - 1; i >= 0; i--) {
        const p = pendingFly[i];
        p.freezeLeft -= dt;
        if (p.freezeLeft > 0) pinDrop(p);
        else {
          pendingFly.splice(i, 1);
          releaseCut(p);
        }
      }
      const slowing = slowLeft > 0;
      if (slowing) slowLeft = Math.max(0, slowLeft - dt);
      physics.step(slowing ? dt * FINALE.scale : dt);
      for (const p of pendingFly) {
        p.keep.position.copy(p.keepRest).add(p.squeeze);
        p.drop.position.copy(p.dropRest).addScaledVector(p.squeeze, -1);
      }
      shake.step(dt);
    },
    applyView: () => shake.applyView(),
    restoreView: () => shake.restoreView(),
    dispose: () => {
      input.dispose();
      panel.dispose();
      overlay.canvas.remove();
      wood.dispose();
      physics.dispose();
    },
  };
}
