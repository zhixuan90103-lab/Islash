import { SFX_FILES, sfxUrl, type SfxId } from './catalog';

export type WebAudioBackend = {
  preload: () => Promise<{ swooshDur: number }>;
  unlock: () => void;
  play: (id: SfxId, volume: number, rate: number) => void;
  dispose: () => void;
};

export function createWebAudioBackend(): WebAudioBackend {
  let ctx: AudioContext | null = null;
  const buffers = new Map<SfxId, AudioBuffer>();
  let master: GainNode | null = null;
  let loaded = false;

  const ensure = (): AudioContext | null => {
    if (ctx) return ctx;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    return ctx;
  };

  const unlock = () => {
    const c = ensure();
    if (!c) return;
    if (c.state === 'suspended') void c.resume();
  };

  const preload = async () => {
    const c = ensure();
    if (!c) return { swooshDur: 0.3 };
    if (!loaded) {
      await Promise.all(
        (Object.keys(SFX_FILES) as SfxId[]).map(async (id) => {
          const res = await fetch(sfxUrl(SFX_FILES[id]));
          const raw = await res.arrayBuffer();
          const buf = await c.decodeAudioData(raw.slice(0));
          buffers.set(id, buf);
        }),
      );
      loaded = true;
    }
    return { swooshDur: buffers.get('swoosh')?.duration ?? 0.3 };
  };

  const play = (id: SfxId, volume: number, rate: number) => {
    const c = ctx;
    const buf = buffers.get(id);
    if (!c || !master || !buf || c.state === 'closed') return;
    if (c.state === 'suspended') void c.resume();
    const src = c.createBufferSource();
    const g = c.createGain();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.25, Math.min(2.5, rate));
    g.gain.value = Math.max(0, Math.min(1, volume));
    src.connect(g);
    g.connect(master);
    src.start();
  };

  return {
    preload,
    unlock,
    play,
    dispose: () => {
      void ctx?.close();
      ctx = null;
      master = null;
      buffers.clear();
      loaded = false;
    },
  };
}
