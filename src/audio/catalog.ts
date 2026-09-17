export const SFX_FILES = {
  swoosh: 'sfx/slash-swoosh.mp3',
  crack: 'sfx/wood-crack.mp3',
} as const;

export type SfxId = keyof typeof SFX_FILES;

export function sfxUrl(rel: string): string {
  const base = import.meta.env.BASE_URL || './';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}${rel.replace(/^\//, '')}`;
}
