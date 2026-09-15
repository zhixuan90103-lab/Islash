import * as THREE from 'three';
import { VIEW } from './design';

function hexRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

/** 径向水色 + 同心圆，贴在 scene.background。 */
export function createBackdropTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 1024;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const [cr, cg, cb] = hexRgb(VIEW.bgCenter);
  const [er, eg, eb] = hexRgb(VIEW.bgEdge);
  const g = ctx.createRadialGradient(w * 0.5, h * 0.42, 20, w * 0.5, h * 0.42, h * 0.72);
  g.addColorStop(0, `rgb(${cr},${cg},${cb})`);
  g.addColorStop(0.45, `rgb(${(cr + er) >> 1},${(cg + eg) >> 1},${(cb + eb) >> 1})`);
  g.addColorStop(1, `rgb(${er},${eg},${eb})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(8, 70, 110, 0.14)';
  ctx.lineWidth = 3;
  const cx = w * 0.5;
  const cy = h * 0.42;
  for (let i = 1; i <= 8; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, 48 * i, 0, Math.PI * 2);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}