/**
 * Boot: safe-area → device preview → WebGPU design stage → 划切玩法。
 * 玩法在 src/game/，参数在 src/game/design.ts。
 * Keep: adapt/*, create-renderer, utils/haptics, DOM contract.
 */

import * as THREE from 'three';
import { Capacitor } from '@capacitor/core';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  applyStageTransform,
  computeStageLayout,
  watchStageLayout,
  type StageLayout,
} from './adapt/design';
import { VIEW, mountSlashWorld } from './game';
import { createBackdropTexture } from './game/backdrop';
import {
  mountDevicePreview,
  type DevicePreviewController,
} from './adapt/devicePreview';
import { applyNativeClass, applySafeAreaCssVars } from './adapt/safeArea';
import { createRenderer, resizeToDesign } from './create-renderer';

const shell = document.getElementById('shell')!;
const viewportEl = document.getElementById('viewport')!;
const stage = document.getElementById('stage')!;
const statusEl = document.getElementById('status');

function setStatus(text: string): void {
  if (statusEl) statusEl.textContent = text;
}

async function boot(): Promise<void> {
  applyNativeClass();

  const platform = Capacitor.getPlatform();
  const native = Capacitor.isNativePlatform();

  setStatus(
    `platform: ${platform} | native: ${native}\n` +
      `design: ${DESIGN_WIDTH}×${DESIGN_HEIGHT}\n` +
      `creating WebGPU…`,
  );

  const renderer = await createRenderer({ container: stage });
  const scene = new THREE.Scene();
  scene.background = createBackdropTexture();

  const camera = new THREE.PerspectiveCamera(
    VIEW.fov,
    DESIGN_WIDTH / DESIGN_HEIGHT,
    0.1,
    100,
  );
  camera.position.set(0, 0, VIEW.cameraZ);
  camera.lookAt(0, 0, 0);

  scene.add(
    new THREE.HemisphereLight(VIEW.hemiSky, VIEW.hemiGround, VIEW.hemiIntensity),
  );
  const key = new THREE.DirectionalLight(VIEW.keyColor, VIEW.keyIntensity);
  key.position.set(VIEW.keyPos[0], VIEW.keyPos[1], VIEW.keyPos[2]);
  scene.add(key);

  renderer.domElement.style.pointerEvents = 'none';

  let latestLayout: StageLayout | null = null;
  let preview: DevicePreviewController;

  const onLayout = (layout: StageLayout) => {
    latestLayout = layout;
    applyStageTransform(stage, layout);
    applySafeAreaCssVars(native);
    resizeToDesign(renderer, camera);
    setStatus(
      `WebGPU OK · ${DESIGN_WIDTH}×${DESIGN_HEIGHT}\n` +
        `划穿方块 → 裂成两块并掉落`,
    );
  };

  preview = mountDevicePreview(shell, viewportEl, () => {
    const size = preview.getViewSize();
    onLayout(computeStageLayout(size.width, size.height, 'contain'));
  });

  const unwatch = watchStageLayout(onLayout, {
    mode: 'contain',
    getViewSize: () => preview.getViewSize(),
  });

  if (new URLSearchParams(window.location.search).has('debugFit')) {
    const log = () => {
      if (latestLayout) {
        console.info('[debugFit]', latestLayout, preview.getDevice());
      }
    };
    window.addEventListener('resize', log);
    log();
  }

  // Optional: document.body.classList.add('debug-safe-area')

  const slash = await mountSlashWorld(stage, scene, camera, () => latestLayout);
  const clock = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    slash.step(clock.getDelta());
    renderer.render(scene, camera);
  });

  window.addEventListener(
    'pagehide',
    () => {
      unwatch();
      preview.dispose();
      slash.dispose();
      renderer.setAnimationLoop(null);
      renderer.dispose();
    },
    { once: true },
  );
}

boot().catch((err) => {
  console.error(err);
  setStatus(`boot failed: ${err instanceof Error ? err.message : String(err)}`);
});
