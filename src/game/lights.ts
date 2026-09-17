import * as THREE from 'three';
import { LIGHT, VIEW, lightKeyPos } from './design';

let hemi: THREE.HemisphereLight | null = null;
let key: THREE.DirectionalLight | null = null;
let fill: THREE.DirectionalLight | null = null;

export function applyGameLights(): void {
  if (!hemi || !key || !fill) return;
  hemi.intensity = LIGHT.hemiIntensity;
  fill.intensity = LIGHT.fillIntensity;
  key.intensity = LIGHT.keyIntensity;
  const p = lightKeyPos();
  key.position.set(p.x, p.y, p.z);
  fill.position.set(0, 0.3, VIEW.cameraZ);
}

export function mountGameLights(scene: THREE.Scene): void {
  hemi = new THREE.HemisphereLight(
    VIEW.hemiSky,
    VIEW.hemiGround,
    LIGHT.hemiIntensity,
  );
  scene.add(hemi);

  fill = new THREE.DirectionalLight(VIEW.fillColor, LIGHT.fillIntensity);
  fill.position.set(0, 0.3, VIEW.cameraZ);
  scene.add(fill);

  key = new THREE.DirectionalLight(VIEW.keyColor, LIGHT.keyIntensity);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.4;
  key.shadow.camera.far = 18;
  key.shadow.camera.left = -4.2;
  key.shadow.camera.right = 4.2;
  key.shadow.camera.top = 5.2;
  key.shadow.camera.bottom = -5.2;
  key.shadow.bias = -0.0015;
  key.shadow.radius = 5;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  scene.add(key.target);
  applyGameLights();
}
