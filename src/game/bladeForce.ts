import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { PHYS, bladeSpeedScale } from './design';

const _keepC = new THREE.Vector3();
const _dropC = new THREE.Vector3();
const _n = new THREE.Vector3();
const _t = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _imp = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _com = new THREE.Vector3();
const _at = new THREE.Vector3();

function bboxWorldCenter(mesh: THREE.Mesh, out: THREE.Vector3): void {
  mesh.geometry.computeBoundingBox();
  mesh.geometry.boundingBox!.getCenter(out);
  mesh.localToWorld(out);
}

/** 只踢被砍下的块：刀向为主，切开法线/朝相机/上挑为辅。 */
export function applyBladeImpulse(
  body: RAPIER.RigidBody,
  camera: THREE.Camera,
  keep: THREE.Mesh,
  drop: THREE.Mesh,
  bladeDir: THREE.Vector3,
  hitPoint: THREE.Vector3,
  speedPxPerSec: number,
  speedMul = 1,
): void {
  bboxWorldCenter(keep, _keepC);
  bboxWorldCenter(drop, _dropC);

  _t.copy(bladeDir);
  if (_t.lengthSq() < 1e-8) _t.set(1, 0, 0);
  else _t.normalize();
  _t.y *= PHYS.bladeYScale;

  _n.subVectors(_dropC, _keepC);
  if (_n.lengthSq() < 1e-8) _n.set(0, 1, 0);
  else _n.normalize();

  _toCam.subVectors(camera.position, _dropC);
  if (_toCam.lengthSq() < 1e-8) _toCam.set(0, 0, 1);
  else _toCam.normalize();
  _toCam.y *= PHYS.camYScale;

  // 固定冲量 / 质量 = 速度：小块会飞出屏幕，大块几乎不动。
  // 改成 Δv ≈ impulseBase * kickToSpeed * 滑速系数，再夹速度。
  body.recomputeMassPropertiesFromColliders();
  const mass = Math.max(0.05, body.mass());
  const targetSpeed =
    PHYS.impulseBase *
    PHYS.kickToSpeed *
    bladeSpeedScale(speedPxPerSec) *
    Math.max(0.2, speedMul);
  const J = mass * targetSpeed;
  _imp
    .copy(_t)
    .multiplyScalar(PHYS.wBlade)
    .addScaledVector(_n, PHYS.wNormal)
    .addScaledVector(_toCam, PHYS.wCam)
    .addScaledVector(_up, PHYS.wLift);
  if (_imp.lengthSq() < 1e-8) _imp.copy(_t);
  else _imp.normalize().multiplyScalar(J);
  _imp.y = Math.min(_imp.y, J * PHYS.maxUpFraction);

  const t = body.translation();
  _com.set(t.x, t.y, t.z);
  _at.copy(_com).lerp(hitPoint, 0.2);

  body.applyImpulseAtPoint(
    { x: _imp.x, y: _imp.y, z: _imp.z },
    { x: _at.x, y: _at.y, z: _at.z },
    true,
  );

  const lv = body.linvel();
  const speed = Math.hypot(lv.x, lv.y, lv.z);
  if (speed > PHYS.maxSpeed && speed > 1e-6) {
    const s = PHYS.maxSpeed / speed;
    body.setLinvel({ x: lv.x * s, y: lv.y * s, z: lv.z * s }, true);
  }
  const av = body.angvel();
  const spin = Math.hypot(av.x, av.y, av.z);
  if (spin > PHYS.maxSpin && spin > 1e-6) {
    const s = PHYS.maxSpin / spin;
    body.setAngvel({ x: av.x * s, y: av.y * s, z: av.z * s }, true);
  }
}

export function pieceVolume(m: THREE.Mesh): number {
  const profile = m.userData.profile as { x: number; y: number }[] | undefined;
  const depth = m.userData.depth as number | undefined;
  if (profile && profile.length >= 3 && depth) {
    let a = 0;
    for (let i = 0; i < profile.length; i++) {
      const p = profile[i];
      const q = profile[(i + 1) % profile.length];
      a += p.x * q.y - q.x * p.y;
    }
    return Math.abs(a * 0.5) * depth;
  }
  m.geometry.computeBoundingBox();
  const bb = m.geometry.boundingBox;
  if (!bb) return 0;
  const s = bb.getSize(new THREE.Vector3());
  return Math.max(0, s.x * s.y * s.z);
}
