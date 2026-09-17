import * as THREE from 'three';
import { applyBladeImpulse, pieceVolume } from './bladeForce';
import { boardCutProgress, CUT, FINALE, FX, SHAKE, WOOD } from './design';
import { mountCutProgressHud } from './cutProgressHud';
import { createScreenShake, cutHit } from './screenShake';
import type { PhysBody } from './slashPhysics';
import {
  crackAlongStroke,
  resetSlashIntent,
  stepSlashIntent,
} from './slashIntent';
import { beginFollow } from './slashFollow';
import { applyGameLights } from './lights';
import { mountSlashDebugPanel } from './slashDebugPanel';
import { createSlashOverlay } from './slashDebug';
import { cutMeshBySlash, prepareCuttable } from './slashCut';
import { projectMeshHull } from './slashHit';
import {
  createSlashInput,
  segmentSpeedPxPerSec,
  type ConsumedLine,
  type DesignPoint,
  type SlashStroke,
} from './slashInput';
import { createSlashPhysics } from './slashPhysics';
import { createWoodSet } from './wood';
import { createSlashHaptics } from './slashHaptics';
import { gameAudio } from '../audio/gameAudio';
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
  void gameAudio.preload();
  const overlay = createSlashOverlay(stage);
  const shake = createScreenShake(camera);
  const bladeHaptics = createSlashHaptics();
  const wood = createWoodSet(scene, physics);
  wood.spawn();
  let enter: { from: number; to: number; t: number } | null = null;
  const beginEnter = () => {
    const mesh = wood.cuttables[0];
    enter = mesh
      ? { from: mesh.position.y, to: WOOD.lift, t: 0 }
      : null;
  };
  beginEnter();
  let nextBoardIn = -1;
  let lastCommit: { c0: DesignPoint; c1: DesignPoint } | null = null;
  let lastMeshFail: { c0: DesignPoint; c1: DesignPoint } | null = null;
  let strokeCuts: { c0: DesignPoint; c1: DesignPoint }[] = [];
  let lastClearedLine: ConsumedLine | null = null;
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
    if (p.finish) {
      slowLeft = 0;
      nextBoardIn = CUT.nextDelay;
    }
  };

  const applyCommit = (
    stroke: SlashStroke,
    seg: [DesignPoint, DesignPoint],
    dtSec: number,
    commit: {
      mesh: THREE.Mesh;
      c0: DesignPoint;
      c1: DesignPoint;
      enterEdge?: number;
    },
    commitFlash: boolean,
    crack: { c0: DesignPoint; c1: DesignPoint } | null,
  ): boolean => {
    camera.updateMatrixWorld(true);
    const result = cutMeshBySlash(commit.mesh, camera, commit.c0, commit.c1);
    if (!result) {
      report('碰到了但切开失败');
      lastMeshFail = { c0: commit.c0, c1: commit.c1 };
      if (!stroke.progress.has(commit.mesh.id)) {
        const dx = commit.c1.x - commit.c0.x;
        const dy = commit.c1.y - commit.c0.y;
        const len = Math.hypot(dx, dy) || 1;
        stroke.progress.set(commit.mesh.id, {
          c0: commit.c0,
          c1: commit.c1,
          chord: Math.hypot(
            commit.c1.x - commit.c0.x,
            commit.c1.y - commit.c0.y,
          ),
          inside: false,
          enterEdge: commit.enterEdge ?? -1,
          dirx: dx / len,
          diry: dy / len,
        });
      }
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
    beginFollow(
      stroke,
      commit.c0,
      commit.c1,
      pieces.keep.id,
      pieces.drop.id,
    );
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
    hud.set(boardCutProgress(originVol, keepVol, finish));
    bladeHaptics.onCut(speedPx, finish);
    const sizeK = Math.min(1, (2 * dropVol) / Math.max(1e-12, dropVol + keepVol));
    gameAudio.crack({ speedPx, sizeK, finish });
    gameAudio.resetSlide();
    report(finish ? '完成切割' : '已切开');
    return true;
  };

  const uiRoot = document.getElementById('ui-root');
  const hud = uiRoot
    ? mountCutProgressHud(uiRoot)
    : { set: (_t: number) => {}, dispose: () => {} };
  const panel = uiRoot
    ? mountSlashDebugPanel(uiRoot, {
        onWoodChange: () => {
          nextBoardIn = -1;
          wood.spawn();
          beginEnter();
          hud.set(0);
          slowLeft = 0;
        },
        onGravityChange: (y) => physics.setGravityY(y),
        onLightChange: () => applyGameLights(),
      })
    : { dispose: () => {} };

  const input = createSlashInput(stage, getLayout, {
    onStroke: (stroke) => {
      if (stroke.points.length === 1) {
        lastCommit = null;
        lastMeshFail = null;
        strokeCuts = [];
        lastClearedLine = null;
        overlay.begin();
        gameAudio.unlock();
      }
    },
    onTip: (p) => {
      overlay.push(p);
    },
    onPredicted: (points) => {
      overlay.setPredicted(points);
    },
    onMove: (stroke, lastSeg, dtSec) => {
      const followBefore = stroke.follow;
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
      const onBoard =
        !!frame.enter &&
        (frame.phase === 'track' || frame.phase === 'aimed' || !!frame.commit);
      if (onBoard) {
        gameAudio.slideOnBoard(
          segmentSpeedPxPerSec(lastSeg[0], lastSeg[1], dtSec),
        );
      }
      let meshFailNow = false;
      if (frame.commit) {
        const ok = applyCommit(
          stroke,
          lastSeg,
          dtSec,
          frame.commit,
          frame.commitFlash,
          frame.crack,
        );
        if (!ok) {
          meshFailNow = true;
          bladeHaptics.cancel();
        } else {
          strokeCuts.push({ c0: frame.commit.c0, c1: frame.commit.c1 });
        }
      } else {
        bladeHaptics.onFrame(frame);
        if (frame.earlyFlash) {
          const chord = frame.crack ?? frame.cyan;
          if (chord) overlay.flash(chord.c0, chord.c1, true);
        }
      }
      overlay.setPreview(null);
      if (followBefore && !stroke.follow) {
        lastClearedLine = followBefore;
      }
      const trackedMesh =
        frame.meshId != null
          ? wood.cuttables.find((m) => m.id === frame.meshId)
          : wood.cuttables[0];
      const hull = trackedMesh
        ? projectMeshHull(trackedMesh, camera)?.hull ?? null
        : null;
      overlay.setIntentDebug({
        geom: frame.cyan,
        locked:
          frame.locked && stroke.intent.c0 && stroke.intent.c1
            ? { c0: stroke.intent.c0, c1: stroke.intent.c1 }
            : null,
        commit: lastCommit,
        stable: stroke.intent.stable,
        lockedFlag: frame.locked,
        phase: frame.phase,
        why: meshFailNow ? '剖分失败（剪影过了轮廓没切开）' : frame.why,
        hull,
        enter: stroke.enterLock?.c0 ?? frame.enter,
        enterEdge: frame.enterEdge,
        travel: frame.travelRatio,
        occupying: frame.phase === 'hold',
        consumed: stroke.follow ? [stroke.follow] : [],
        meshFail: lastMeshFail,
        cuts: strokeCuts,
        cleared: lastClearedLine,
        seg: { c0: lastSeg[0], c1: lastSeg[1] },
      });
    },
    onEnd: (stroke) => {
      gameAudio.resetSlide();
      bladeHaptics.cancel();
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
      if (enter && CUT.enterDur > 1e-4) {
        enter.t = Math.min(1, enter.t + dt / CUT.enterDur);
        const u = 1 - (1 - enter.t) ** 3;
        const y = enter.from + (enter.to - enter.from) * u;
        for (const mesh of wood.cuttables) {
          const rec = physics.bodies.find((b) => b.mesh === mesh);
          if (!rec) continue;
          const t = rec.body.translation();
          rec.body.setTranslation({ x: t.x, y, z: t.z }, true);
        }
        if (enter.t >= 1) enter = null;
      }
      physics.step(slowing ? dt * FINALE.scale : dt);
      for (const p of pendingFly) {
        p.keep.position.copy(p.keepRest).add(p.squeeze);
        p.drop.position.copy(p.dropRest).addScaledVector(p.squeeze, -1);
      }
      shake.step(dt);
      if (nextBoardIn >= 0) {
        nextBoardIn -= dt;
        if (nextBoardIn <= 0) {
          nextBoardIn = -1;
          wood.spawn(true);
          beginEnter();
          hud.set(0);
          report('下一块');
        }
      }
    },
    applyView: () => shake.applyView(),
    restoreView: () => shake.restoreView(),
    dispose: () => {
      gameAudio.dispose();
      bladeHaptics.cancel();
      input.dispose();
      panel.dispose();
      hud.dispose();
      overlay.canvas.remove();
      wood.dispose();
      physics.dispose();
    },
  };
}
