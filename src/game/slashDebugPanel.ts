import {
  FLASH,
  FLASH_DEFAULT,
  INTENT,
  INTENT_DEFAULT,
  PHYS,
  PHYS_DEFAULT,
  TRAIL,
  TRAIL_DEFAULT,
  WOOD,
  WOOD_DEFAULT,
  WOOD_SHAPE,
  woodSize,
} from './design';

type SliderSpec = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
};

const PHYS_SLIDERS: SliderSpec[] = [
  { key: 'impulseBase', label: '冲量', min: 0.05, max: 4, step: 0.05 },
  { key: 'kickToSpeed', label: '冲量→速度', min: 0.5, max: 12, step: 0.5 },
  { key: 'maxSpeed', label: '速度上限', min: 1, max: 16, step: 0.5 },
  { key: 'maxSpin', label: '转速上限', min: 1, max: 40, step: 1 },
  { key: 'speedRef', label: '满力滑速', min: 200, max: 3000, step: 50 },
  { key: 'wBlade', label: '刀向', min: 0, max: 1, step: 0.01 },
  { key: 'wNormal', label: '法线', min: 0, max: 1, step: 0.01 },
  { key: 'wCam', label: '朝屏幕', min: 0, max: 1, step: 0.01 },
  { key: 'wLift', label: '上挑', min: 0, max: 0.5, step: 0.01 },
  { key: 'bladeYScale', label: '上下差', min: 0, max: 1, step: 0.05 },
  { key: 'maxUpFraction', label: '升力上限', min: 0.05, max: 1, step: 0.01 },
  { key: 'gravityY', label: '重力Y', min: -12, max: -0.5, step: 0.1 },
  { key: 'density', label: '密度', min: 0.4, max: 6, step: 0.1 },
];

const TRAIL_SLIDERS: SliderSpec[] = [
  { key: 'life', label: '拖尾寿命', min: 0.08, max: 1.2, step: 0.02 },
  { key: 'minDist', label: '拖尾间距', min: 0.5, max: 16, step: 0.5 },
  { key: 'headW', label: '刀尖宽', min: 1, max: 28, step: 0.5 },
  { key: 'tailW', label: '尾宽', min: 0, max: 8, step: 0.1 },
];

const INTENT_SLIDERS: SliderSpec[] = [
  { key: 'lockSegs', label: '锁定段数', min: 1, max: 12, step: 1 },
  { key: 'minFromEnter', label: '离入点', min: 0, max: 40, step: 1 },
  { key: 'lockAngle', label: '锁定角', min: 4, max: 45, step: 1 },
  { key: 'unlockAngle', label: '解锁角', min: 10, max: 80, step: 1 },
  { key: 'minSpeed', label: '锁定滑速', min: 20, max: 250, step: 5 },
  { key: 'debug', label: '对缝调试', min: 0, max: 1, step: 1 },
];

const FLASH_SLIDERS: SliderSpec[] = [
  { key: 'life', label: '刀光寿命', min: 0.06, max: 0.8, step: 0.02 },
  { key: 'coreW', label: '刀光芯宽', min: 0.5, max: 10, step: 0.1 },
  { key: 'glowW', label: '泛光半径', min: 4, max: 48, step: 1 },
  { key: 'overshoot', label: '甩出px', min: 0, max: 80, step: 1 },
  { key: 'overshootRatio', label: '甩出比例', min: 0, max: 0.8, step: 0.02 },
  { key: 'previewAlpha', label: '预览亮度', min: 0.2, max: 1, step: 0.02 },
];

const WOOD_FIELDS: { key: keyof typeof WOOD; label: string }[] = [
  { key: 'width', label: '长 X' },
  { key: 'height', label: '高 Y' },
  { key: 'depth', label: '厚 Z' },
  { key: 'lift', label: '中心Y' },
];

function blockStage(el: HTMLElement): void {
  const stop = (e: Event) => e.stopPropagation();
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'mousedown']) {
    el.addEventListener(type, stop);
  }
}

export function mountSlashDebugPanel(
  uiRoot: HTMLElement,
  hooks: {
    onWoodChange: () => void;
    onGravityChange: (y: number) => void;
  },
): { dispose: () => void } {
  const wrap = document.createElement('section');
  wrap.className = 'debug-panel';
  wrap.innerHTML = `
    <button type="button" class="debug-toggle">收起参数</button>
    <div class="debug-body">
      <p class="debug-sec">木头乘数（1 = 设计形体 ${WOOD_SHAPE.width}×${WOOD_SHAPE.height}×${WOOD_SHAPE.depth}）</p>
      <p class="debug-ratio" id="wood-ratio"></p>
      <div class="debug-wood"></div>
      <p class="debug-sec">物理</p>
      <div class="debug-sliders"></div>
      <p class="debug-sec">拖尾</p>
      <div class="debug-trail"></div>
      <p class="debug-sec">意图</p>
      <div class="debug-intent"></div>
      <p class="debug-sec">刀光</p>
      <div class="debug-flash"></div>
      <div class="debug-actions">
        <button type="button" data-act="wood">重置木头</button>
        <button type="button" data-act="phys">重置物理</button>
        <button type="button" data-act="trail">重置拖尾</button>
        <button type="button" data-act="intent">重置意图</button>
        <button type="button" data-act="flash">重置刀光</button>
      </div>
    </div>
  `;
  uiRoot.appendChild(wrap);
  blockStage(wrap);

  const body = wrap.querySelector('.debug-body') as HTMLElement;
  const woodBox = wrap.querySelector('.debug-wood') as HTMLElement;
  const list = wrap.querySelector('.debug-sliders') as HTMLElement;
  const trailList = wrap.querySelector('.debug-trail') as HTMLElement;
  const intentList = wrap.querySelector('.debug-intent') as HTMLElement;
  const flashList = wrap.querySelector('.debug-flash') as HTMLElement;
  const toggle = wrap.querySelector('.debug-toggle') as HTMLButtonElement;

  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    body.hidden = !body.hidden;
    toggle.textContent = body.hidden ? '调试参数' : '收起参数';
  });

  const ratioEl = wrap.querySelector('#wood-ratio') as HTMLElement;
  const woodInputs: HTMLInputElement[] = [];

  const woodRatioText = () => {
    const s = woodSize();
    return `实际 ${s.width.toFixed(2)} × ${s.height.toFixed(2)} × ${s.depth.toFixed(2)}　乘数 ${WOOD.width} : ${WOOD.height} : ${WOOD.depth}`;
  };

  const applyWood = () => {
    WOOD_FIELDS.forEach((f, i) => {
      const n = Number(woodInputs[i].value);
      if (Number.isFinite(n) && n > 0) WOOD[f.key] = n;
    });
    ratioEl.textContent = woodRatioText();
    hooks.onWoodChange();
  };

  for (const field of WOOD_FIELDS) {
    const row = document.createElement('label');
    row.className = 'debug-row debug-row-num';
    row.innerHTML = `<span>${field.label}</span><input type="number" step="0.01" min="0.01" inputmode="decimal" />`;
    const input = row.querySelector('input')!;
    input.value = String(WOOD[field.key]);
    input.addEventListener('change', applyWood);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyWood();
        input.blur();
      }
    });
    woodBox.appendChild(row);
    woodInputs.push(input);
  }
  ratioEl.textContent = woodRatioText();

  const physInputs: { spec: SliderSpec; input: HTMLInputElement; val: HTMLSpanElement }[] =
    [];

  for (const spec of PHYS_SLIDERS) {
    const row = document.createElement('label');
    row.className = 'debug-row';
    const cur = PHYS[spec.key as keyof typeof PHYS];
    row.innerHTML = `<span>${spec.label}</span><input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}" /><span class="debug-val"></span>`;
    const input = row.querySelector('input')!;
    const val = row.querySelector('.debug-val') as HTMLSpanElement;
    input.value = String(cur);
    val.textContent = Number(cur).toFixed(spec.step < 1 ? 2 : 0);
    input.addEventListener('input', () => {
      const n = Number(input.value);
      (PHYS as Record<string, number>)[spec.key] = n;
      val.textContent = n.toFixed(spec.step < 1 ? 2 : 0);
      if (spec.key === 'gravityY') hooks.onGravityChange(PHYS.gravityY);
    });
    list.appendChild(row);
    physInputs.push({ spec, input, val });
  }

  const trailInputs: { spec: SliderSpec; input: HTMLInputElement; val: HTMLSpanElement }[] =
    [];

  for (const spec of TRAIL_SLIDERS) {
    const row = document.createElement('label');
    row.className = 'debug-row';
    const cur = TRAIL[spec.key as keyof typeof TRAIL];
    row.innerHTML = `<span>${spec.label}</span><input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}" /><span class="debug-val"></span>`;
    const input = row.querySelector('input')!;
    const val = row.querySelector('.debug-val') as HTMLSpanElement;
    input.value = String(cur);
    val.textContent = Number(cur).toFixed(spec.step < 1 ? 2 : 0);
    input.addEventListener('input', () => {
      const n = Number(input.value);
      (TRAIL as Record<string, number>)[spec.key] = n;
      val.textContent = n.toFixed(spec.step < 1 ? 2 : 0);
    });
    trailList.appendChild(row);
    trailInputs.push({ spec, input, val });
  }

  const intentInputs: { spec: SliderSpec; input: HTMLInputElement; val: HTMLSpanElement }[] =
    [];

  for (const spec of INTENT_SLIDERS) {
    const row = document.createElement('label');
    row.className = 'debug-row';
    const cur = INTENT[spec.key as keyof typeof INTENT];
    row.innerHTML = `<span>${spec.label}</span><input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}" /><span class="debug-val"></span>`;
    const input = row.querySelector('input')!;
    const val = row.querySelector('.debug-val') as HTMLSpanElement;
    input.value = String(cur);
    val.textContent = Number(cur).toFixed(spec.step < 1 ? 2 : 0);
    input.addEventListener('input', () => {
      const n = Number(input.value);
      (INTENT as Record<string, number>)[spec.key] = n;
      val.textContent = n.toFixed(spec.step < 1 ? 2 : 0);
    });
    intentList.appendChild(row);
    intentInputs.push({ spec, input, val });
  }

  const flashInputs: { spec: SliderSpec; input: HTMLInputElement; val: HTMLSpanElement }[] =
    [];

  for (const spec of FLASH_SLIDERS) {
    const row = document.createElement('label');
    row.className = 'debug-row';
    const cur = FLASH[spec.key as keyof typeof FLASH];
    row.innerHTML = `<span>${spec.label}</span><input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}" /><span class="debug-val"></span>`;
    const input = row.querySelector('input')!;
    const val = row.querySelector('.debug-val') as HTMLSpanElement;
    input.value = String(cur);
    val.textContent = Number(cur).toFixed(spec.step < 1 ? 2 : 0);
    input.addEventListener('input', () => {
      const n = Number(input.value);
      (FLASH as Record<string, number>)[spec.key] = n;
      val.textContent = n.toFixed(spec.step < 1 ? 2 : 0);
    });
    flashList.appendChild(row);
    flashInputs.push({ spec, input, val });
  }

  const sync = () => {
    WOOD_FIELDS.forEach((f, i) => {
      woodInputs[i].value = String(WOOD[f.key]);
    });
    ratioEl.textContent = woodRatioText();
    for (const { spec, input, val } of physInputs) {
      const n = PHYS[spec.key as keyof typeof PHYS];
      input.value = String(n);
      val.textContent = n.toFixed(spec.step < 1 ? 2 : 0);
    }
    for (const { spec, input, val } of trailInputs) {
      const n = TRAIL[spec.key as keyof typeof TRAIL];
      input.value = String(n);
      val.textContent = n.toFixed(spec.step < 1 ? 2 : 0);
    }
    for (const { spec, input, val } of intentInputs) {
      const n = INTENT[spec.key as keyof typeof INTENT];
      input.value = String(n);
      val.textContent = n.toFixed(spec.step < 1 ? 2 : 0);
    }
    for (const { spec, input, val } of flashInputs) {
      const n = FLASH[spec.key as keyof typeof FLASH];
      input.value = String(n);
      val.textContent = n.toFixed(spec.step < 1 ? 2 : 0);
    }
  };

  wrap.querySelector('[data-act="wood"]')!.addEventListener('click', (e) => {
    e.stopPropagation();
    Object.assign(WOOD, WOOD_DEFAULT);
    sync();
    hooks.onWoodChange();
  });
  wrap.querySelector('[data-act="phys"]')!.addEventListener('click', (e) => {
    e.stopPropagation();
    Object.assign(PHYS, PHYS_DEFAULT);
    sync();
    hooks.onGravityChange(PHYS.gravityY);
  });
  wrap.querySelector('[data-act="trail"]')!.addEventListener('click', (e) => {
    e.stopPropagation();
    Object.assign(TRAIL, TRAIL_DEFAULT);
    sync();
  });
  wrap.querySelector('[data-act="intent"]')!.addEventListener('click', (e) => {
    e.stopPropagation();
    Object.assign(INTENT, INTENT_DEFAULT);
    sync();
  });
  wrap.querySelector('[data-act="flash"]')!.addEventListener('click', (e) => {
    e.stopPropagation();
    Object.assign(FLASH, FLASH_DEFAULT);
    sync();
  });

  return {
    dispose: () => wrap.remove(),
  };
}
