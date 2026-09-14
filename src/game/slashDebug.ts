import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../adapt/design';
import type { DesignPoint } from './slashInput';
import type { ProjPoly } from './slashHit';

export type DebugHit = { hull: ProjPoly; through: boolean };

export function createSlashOverlay(stage: HTMLElement): {
  canvas: HTMLCanvasElement;
  draw: (points: DesignPoint[], hits: DebugHit[]) => void;
  clear: () => void;
} {
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none;';
  stage.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  const syncSize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(DESIGN_WIDTH * dpr);
    canvas.height = Math.round(DESIGN_HEIGHT * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  syncSize();

  const clear = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dpr = canvas.width / DESIGN_WIDTH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const strokePath = (points: DesignPoint[]) => {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  };

  const draw = (points: DesignPoint[], hits: DebugHit[]) => {
    clear();

    for (const h of hits) {
      if (h.hull.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(h.hull[0].x, h.hull[0].y);
      for (let i = 1; i < h.hull.length; i++) ctx.lineTo(h.hull[i].x, h.hull[i].y);
      ctx.closePath();
      ctx.strokeStyle = h.through ? 'rgba(52,211,153,0.45)' : 'rgba(148,163,184,0.28)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    if (points.length === 0) return;

    const head = points[points.length - 1];

    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      return;
    }

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    strokePath(points);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 10;
    ctx.stroke();

    strokePath(points);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 5;
    ctx.stroke();

    strokePath(points);
    ctx.strokeStyle = 'rgba(255,240,180,0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(head.x, head.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#f59e0b';
    ctx.stroke();
  };

  return { canvas, draw, clear };
}
