import * as THREE from 'three';
import { SHAKE, VIEW, bladeSpeedScale } from './design';

const _dir = new THREE.Vector3();
const _off = new THREE.Vector3();

function axisNoise(t: number, seed: number): number {
  const w = SHAKE.freq;
  return 0.55 * Math.sin(t * 28 * w + seed) + 0.45 * Math.sin(t * 47 * w + seed * 2);
}

function easeOutQuad(t: number): number {
  const u = 1 - Math.max(0, Math.min(1, t));
  return 1 - u * u;
}

function easeInCubic(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return u * u * u;
}

/** 掉块占一半时 sizeK=1；屑接近 0。 */
export function cutSizeK(dropVol: number, keepVol: number): number {
  const total = Math.max(1e-8, dropVol + keepVol);
  return Math.min(1, (2 * Math.max(0, dropVol)) / total);
}

export function cutHit(speedPxPerSec: number, dropVol: number, keepVol: number): number {
  const speedK = bladeSpeedScale(speedPxPerSec);
  const sizeK = cutSizeK(dropVol, keepVol);
  return Math.min(1, Math.max(SHAKE.floor, speedK * sizeK));
}

export function createScreenShake(camera: THREE.PerspectiveCamera): {
  hit: (amount: number, dir: THREE.Vector3, kickMul?: number) => void;
  pushIn: () => void;
  step: (dt: number) => void;
  applyView: () => void;
  restoreView: () => void;
} {
  const rest = new THREE.Vector3(0, 0, VIEW.cameraZ);
  let trauma = 0;
  let clock = 0;
  let px = 0;
  let py = 0;
  let fromX = 0;
  let fromY = 0;
  let toX = 0;
  let toY = 0;
  let phase: 'idle' | 'attack' | 'settle' = 'idle';
  let age = 0;
  let kickScale = 1;
  let dolly = 0;
  let dollyFrom = 0;
  let dollyPhase: 'idle' | 'in' | 'out' = 'idle';
  let dollyAge = 0;
  let wobble = 0;
  let wobbleAge = 0;
  let wobbleOn = false;

  const capKick = () => {
    const max = SHAKE.kick * kickScale * 1.8;
    const len = Math.hypot(toX, toY);
    if (len > max && len > 1e-8) {
      const s = max / len;
      toX *= s;
      toY *= s;
    }
  };

  return {
    pushIn: () => {
      if (SHAKE.cancelPush > 0) {
        dollyFrom = dolly;
        dollyPhase = 'in';
        dollyAge = 0;
      }
      if (SHAKE.cancelWobble > 0 && SHAKE.cancelWobbleDur > 1e-4) {
        wobbleOn = true;
        wobbleAge = 0;
      }
    },

    hit: (amount, dir, kickMul = 1) => {
      if (!SHAKE.show) return;
      const hit = Math.min(1, Math.max(0, amount));
      kickScale = Math.max(1, kickMul);
      trauma = Math.min(1, trauma + hit * SHAKE.trauma);
      _dir.copy(dir);
      _dir.z = 0;
      if (_dir.lengthSq() < 1e-10) _dir.set(1, 0, 0);
      else _dir.normalize();
      fromX = px;
      fromY = py;
      toX = px - _dir.x * hit * SHAKE.kick * kickScale;
      toY = py - _dir.y * hit * SHAKE.kick * kickScale;
      capKick();
      phase = 'attack';
      age = 0;
    },

    step: (dt) => {
      const d = Math.min(0.05, Math.max(0, dt));
      clock += d;
      trauma = Math.max(0, trauma - SHAKE.decay * d);
      if (dollyPhase !== 'idle') {
        dollyAge += d;
        if (dollyPhase === 'in') {
          const dur = Math.max(0.02, SHAKE.cancelPushIn);
          const k = easeOutQuad(dollyAge / dur);
          dolly = dollyFrom + (1 - dollyFrom) * k;
          if (dollyAge >= dur) {
            dolly = 1;
            dollyPhase = 'out';
            dollyAge = 0;
          }
        } else {
          const dur = Math.max(0.04, SHAKE.cancelPushOut);
          const k = easeInCubic(dollyAge / dur);
          dolly = 1 - k;
          if (dollyAge >= dur) {
            dolly = 0;
            dollyPhase = 'idle';
            dollyAge = 0;
          }
        }
      }
      if (wobbleOn) {
        wobbleAge += d;
        const dur = Math.max(0.04, SHAKE.cancelWobbleDur);
        const t = Math.min(1, wobbleAge / dur);
        const fall = (1 - t) * (1 - t);
        const hz = Math.max(1, SHAKE.cancelWobbleHz);
        wobble = SHAKE.cancelWobble * fall * Math.sin(t * dur * hz * Math.PI * 2);
        if (t >= 1) {
          wobble = 0;
          wobbleOn = false;
          wobbleAge = 0;
        }
      }
      if (phase === 'idle') return;
      age += d;
      if (phase === 'attack') {
        const dur = Math.max(0.008, SHAKE.attack);
        const k = easeOutQuad(age / dur);
        px = fromX + (toX - fromX) * k;
        py = fromY + (toY - fromY) * k;
        if (age >= dur) {
          px = toX;
          py = toY;
          fromX = px;
          fromY = py;
          toX = 0;
          toY = 0;
          phase = 'settle';
          age = 0;
        }
        return;
      }
      const dur = Math.max(0.04, SHAKE.settle);
      const k = easeInCubic(age / dur);
      px = fromX * (1 - k);
      py = fromY * (1 - k);
      if (age >= dur) {
        px = py = 0;
        phase = 'idle';
        age = 0;
      }
    },

    applyView: () => {
      camera.position.copy(rest);
      camera.rotation.set(0, 0, 0);
      if (dolly > 1e-5 && SHAKE.cancelPush > 0) {
        camera.position.z -= SHAKE.cancelPush * dolly;
      }
      if (Math.abs(wobble) > 1e-6) {
        camera.position.x += wobble;
      }
      if (!SHAKE.show) return;
      const moving = phase !== 'idle' || trauma > 0;
      if (!moving) return;
      const shake = trauma * trauma;
      const rumble = phase === 'attack' ? 0 : shake;
      _off.set(
        px + SHAKE.amp * rumble * axisNoise(clock, 0.2),
        py + SHAKE.amp * rumble * axisNoise(clock, 1.7),
        0,
      );
      camera.position.x += _off.x;
      camera.position.y += _off.y;
      camera.rotation.z = SHAKE.roll * rumble * axisNoise(clock, 3.1);
    },

    restoreView: () => {
      camera.position.copy(rest);
      camera.rotation.set(0, 0, 0);
    },
  };
}
