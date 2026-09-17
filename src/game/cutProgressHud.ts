export function mountCutProgressHud(uiRoot: HTMLElement): {
  set: (t: number) => void;
  dispose: () => void;
} {
  const el = document.createElement('div');
  el.className = 'cut-progress';
  el.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('div');
  fill.className = 'cut-progress-fill';
  el.appendChild(fill);
  uiRoot.insertBefore(el, uiRoot.firstChild);

  const set = (t: number) => {
    const v = Math.min(1, Math.max(0, t));
    fill.style.transform = `scaleX(${v})`;
  };
  set(0);

  return {
    set,
    dispose: () => el.remove(),
  };
}
