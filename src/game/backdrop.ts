import * as THREE from 'three';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../adapt/design';
import { VIEW } from './design';
import bgUrl from '../assets/bg-dojo.jpg';

/** 关卡背景图。 */
export function loadBackdropTexture(): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      bgUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        resolve(tex);
      },
      undefined,
      reject,
    );
  });
}

/**
 * 背景板：贴图不吃光，前面一层 ShadowMaterial 接木板投影。
 */
export function mountBackdropPlane(
  scene: THREE.Scene,
  tex: THREE.Texture,
): void {
  const z = VIEW.bgZ;
  const dist = VIEW.cameraZ - z;
  const h = 2 * dist * Math.tan((VIEW.fov * Math.PI) / 360);
  const w = h * (DESIGN_WIDTH / DESIGN_HEIGHT);
  const geom = new THREE.PlaneGeometry(w * 1.04, h * 1.04);

  const art = new THREE.Mesh(
    geom,
    new THREE.MeshBasicMaterial({ map: tex, depthWrite: true }),
  );
  art.position.z = z;
  art.renderOrder = -2;
  scene.add(art);

  const catcher = new THREE.Mesh(
    geom,
    new THREE.ShadowMaterial({
      color: 0x2a0808,
      opacity: VIEW.shadowOpacity,
      transparent: true,
      depthWrite: false,
    }),
  );
  catcher.position.z = z + 0.02;
  catcher.receiveShadow = true;
  catcher.renderOrder = -1;
  scene.add(catcher);
}
