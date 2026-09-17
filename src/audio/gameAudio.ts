import { Capacitor, registerPlugin } from '@capacitor/core';
import { SFX } from '../game/design';
import { createWebAudioBackend } from './webBackend';

type NativeAudioPlugin = {
  preload(): Promise<{ swooshDur?: number }>;
  play(opts: { id: string; volume: number; rate: number }): Promise<void>;
};

const NativeAudio = registerPlugin<NativeAudioPlugin>('NativeAudio');

const isNativeIos = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

const pluginReady = () =>
  isNativeIos() && Capacitor.isPluginAvailable('NativeAudio');

const web = createWebAudioBackend();
let swooshDur = 0.3;
let slideArmed = false;
let lastCrack = 0;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function play(id: 'swoosh' | 'crack', volume: number, rate: number): void {
  if (pluginReady()) {
    void NativeAudio.play({ id, volume, rate });
    return;
  }
  web.play(id, volume, rate);
}

export const gameAudio = {
  async preload(): Promise<void> {
    if (pluginReady()) {
      try {
        const r = await NativeAudio.preload();
        if (r?.swooshDur && r.swooshDur > 0.05) swooshDur = r.swooshDur;
        return;
      } catch (err) {
        console.warn('[audio] native preload', err);
      }
    }
    const r = await web.preload();
    if (r.swooshDur > 0.05) swooshDur = r.swooshDur;
  },

  unlock(): void {
    web.unlock();
  },

  /**
   * 板上才叫。每刀一次。
   * 慢划把样本拉到 slideMaxDur（≤1s），快划压到 slideMinDur。
   */
  slideOnBoard(speedPx: number): void {
    if (slideArmed) return;
    slideArmed = true;
    const t = clamp01(speedPx / Math.max(1, SFX.speedRef));
    const dur =
      SFX.slideMaxDur + (SFX.slideMinDur - SFX.slideMaxDur) * t;
    const rate = Math.max(0.25, Math.min(2.5, swooshDur / Math.max(0.12, dur)));
    const volume = SFX.volSlow + (SFX.volFast - SFX.volSlow) * t;
    play('swoosh', volume, rate);
  },

  /** 抬手或切完，下一刀可再响一次。 */
  resetSlide(): void {
    slideArmed = false;
  },

  crack(opts: { speedPx: number; sizeK: number; finish: boolean }): void {
    const now = performance.now();
    if (now - lastCrack < 40) return;
    lastCrack = now;
    const speedK = clamp01(opts.speedPx / Math.max(1, SFX.speedRef));
    const sizeK = clamp01(opts.sizeK);
    const vol =
      SFX.crackVol *
      (0.55 + 0.45 * sizeK) *
      (0.72 + 0.28 * speedK) *
      (opts.finish ? SFX.finishCrackMul : 1);
    const rate =
      (SFX.crackRateSmall + (SFX.crackRateBig - SFX.crackRateSmall) * sizeK) *
      (0.92 + 0.2 * speedK);
    play('crack', clamp01(vol), Math.max(0.5, Math.min(2, rate)));
  },

  dispose(): void {
    slideArmed = false;
    web.dispose();
  },
};
