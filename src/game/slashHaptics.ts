import { HAPTIC, bladeSpeedScale } from './design';
import type { IntentFrame } from './slashIntent';
import { haptics } from '../utils/haptics';

/**
 * 一刀触觉：锁 A 轻击 + 弱持续（渐起）→ 切开重击。
 * 走廊余势 / 失败 / 抬手只停持续。
 */
export function createSlashHaptics() {
  let rumbling = false;

  const stopRumble = () => {
    if (!rumbling) return;
    rumbling = false;
    void haptics.stopContinuous();
  };

  const startRumble = () => {
    if (rumbling) return;
    rumbling = true;
    void haptics.stackImpact(HAPTIC.enterI, HAPTIC.enterS);
    void haptics.startContinuous({
      intensity: HAPTIC.holdI,
      sharpness: HAPTIC.holdS,
      duration: HAPTIC.maxHold,
      attack: HAPTIC.attack,
    });
  };

  return {
    onFrame(frame: IntentFrame) {
      if (frame.phase === 'hold' || frame.scribble) {
        stopRumble();
        return;
      }
      if (
        frame.enter &&
        (frame.phase === 'track' || frame.phase === 'aimed')
      ) {
        startRumble();
        return;
      }
      stopRumble();
    },
    onCut(speedPx: number, finish: boolean) {
      rumbling = false;
      void haptics.stopContinuous();
      const t = bladeSpeedScale(speedPx);
      const i = HAPTIC.cutI0 + (HAPTIC.cutI1 - HAPTIC.cutI0) * t;
      const s = HAPTIC.cutS0 + (HAPTIC.cutS1 - HAPTIC.cutS0) * t;
      const mul = finish ? HAPTIC.finishMul : 1;
      void haptics.stackImpact(Math.min(1, i * mul), Math.min(1, s));
    },
    cancel() {
      stopRumble();
    },
  };
}
