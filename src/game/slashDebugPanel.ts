import {
  CUT,
  CUT_DEFAULT,
  FINALE,
  FINALE_DEFAULT,
  FLASH,
  FLASH_DEFAULT,
  FX,
  FX_DEFAULT,
  SHAKE,
  SHAKE_DEFAULT,
  INTENT,
  INTENT_DEFAULT,
  PHYS,
  PHYS_DEFAULT,
  TRAIL,
  TRAIL_DEFAULT,
  WOOD,
  WOOD_DEFAULT,
  WOOD_SHAPE,
  LIGHT,
  LIGHT_DEFAULT,
  HAPTIC,
  HAPTIC_DEFAULT,
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
  { key: 'maxLen', label: '拖尾最长', min: 24, max: 220, step: 2 },
  { key: 'life', label: '收回时长', min: 0.06, max: 0.6, step: 0.02 },
  { key: 'still', label: '停手延迟', min: 0, max: 0.25, step: 0.01 },
  { key: 'stopSpeed', label: '停手速度', min: 4, max: 160, step: 2 },
  { key: 'minDist', label: '拖尾间距', min: 0.5, max: 16, step: 0.5 },
  { key: 'smooth', label: '低通秒', min: 0, max: 0.08, step: 0.002 },
  { key: 'subdiv', label: '曲线细分', min: 1, max: 12, step: 1 },
  { key: 'headW', label: '刀尖宽', min: 1, max: 28, step: 0.5 },
  { key: 'tailW', label: '尾宽', min: 0, max: 8, step: 0.1 },
  { key: 'tipLen', label: '三角尖', min: 0, max: 28, step: 0.5 },
];

const INTENT_SLIDERS: SliderSpec[] = [
  { key: 'lockSegs', label: '锁定段数', min: 1, max: 12, step: 1 },
  { key: 'minFromEnter', label: '离入点', min: 0, max: 40, step: 1 },
  { key: 'lockAngle', label: '锁定角', min: 4, max: 45, step: 1 },
  { key: 'unlockAngle', label: '解锁角', min: 10, max: 80, step: 1 },
  { key: 'minSpeed', label: '锁定滑速', min: 20, max: 250, step: 5 },
  { key: 'debug', label: '对缝调试', min: 0, max: 1, step: 1 },
];

const FX_SLIDERS: SliderSpec[] = [
  { key: 'chipCount', label: '碎屑数量', min: 0, max: 40, step: 1 },
  { key: 'chipLife', label: '碎屑寿命', min: 0.12, max: 1.6, step: 0.02 },
  { key: 'chipSpeed', label: '碎屑速度', min: 40, max: 480, step: 10 },
  { key: 'squeeze', label: '接触挤压', min: 0, max: 0.12, step: 0.005 },
  { key: 'flashAt', label: '闪阈值', min: 0, max: 1, step: 0.02 },
  { key: 'flashLife', label: '闪时长', min: 0.02, max: 0.16, step: 0.005 },
  { key: 'burst', label: '解冻加踢', min: 1, max: 2, step: 0.02 },
];

const FINALE_SLIDERS: SliderSpec[] = [
  { key: 'finishRemain', label: '完成剩余', min: 0.04, max: 0.4, step: 0.02 },
  { key: 'freeze', label: '终刀顿帧', min: 0.04, max: 0.25, step: 0.01 },
  { key: 'scale', label: '慢放倍率', min: 0.06, max: 0.4, step: 0.02 },
  { key: 'kickMul', label: '终刀踢倍', min: 1, max: 5, step: 0.1 },
  { key: 'bladeScale', label: '终刀光倍', min: 1, max: 4, step: 0.1 },
  { key: 'bladeSpan', label: '终刀光长', min: 160, max: 700, step: 10 },
  { key: 'flashPeak', label: '终闪白', min: 0.02, max: 0.5, step: 0.01 },
];

const HAPTIC_SLIDERS: SliderSpec[] = [
  { key: 'enterI', label: '锁A强度', min: 0, max: 1, step: 0.01 },
  { key: 'enterS', label: '锁A锐度', min: 0, max: 1, step: 0.01 },
  { key: 'holdI', label: '持续强度', min: 0, max: 0.6, step: 0.01 },
  { key: 'holdS', label: '持续锐度', min: 0, max: 1, step: 0.01 },
  { key: 'attack', label: '渐起秒', min: 0, max: 0.4, step: 0.01 },
  { key: 'maxHold', label: '持续上限秒', min: 0.2, max: 3, step: 0.05 },
  { key: 'cutI0', label: '切开强度低', min: 0, max: 1, step: 0.01 },
  { key: 'cutI1', label: '切开强度高', min: 0, max: 1, step: 0.01 },
  { key: 'cutS0', label: '切开锐度低', min: 0, max: 1, step: 0.01 },
  { key: 'cutS1', label: '切开锐度高', min: 0, max: 1, step: 0.01 },
  { key: 'finishMul', label: '终刀强度倍', min: 1, max: 1.5, step: 0.02 },
];

const SHAKE_SLIDERS: SliderSpec[] = [
  { key: 'trauma', label: '每刀创伤', min: 0.05, max: 1, step: 0.05 },
  { key: 'decay', label: '创伤衰减', min: 1, max: 16, step: 0.5 },
  { key: 'amp', label: '噪声振幅', min: 0, max: 0.16, step: 0.005 },
  { key: 'kick', label: '踢出振幅', min: 0, max: 0.2, step: 0.005 },
  { key: 'attack', label: '出击时长', min: 0.004, max: 0.12, step: 0.002 },
  { key: 'settle', label: '收回时长', min: 0.06, max: 0.5, step: 0.01 },
  { key: 'freezeMin', label: '顿帧最短', min: 0, max: 0.12, step: 0.004 },
  { key: 'freezeMax', label: '顿帧最长', min: 0.02, max: 0.2, step: 0.004 },
  { key: 'freq', label: '噪声频率', min: 1, max: 12, step: 0.5 },
  { key: 'roll', label: '滚转', min: 0, max: 0.12, step: 0.005 },
  { key: 'floor', label: '力度保底', min: 0, max: 0.4, step: 0.01 },
  { key: 'show', label: '震屏开', min: 0, max: 1, step: 1 },
];

const FLASH_SLIDERS: SliderSpec[] = [
  { key: 'aimAngle', label: '对准角', min: 4, max: 30, step: 1 },
  { key: 'aimSegs', label: '对准段数', min: 1, max: 12, step: 1 },
  { key: 'life', label: '刀光寿命', min: 0.06, max: 0.8, step: 0.02 },
  { key: 'coreW', label: '刀光芯宽', min: 0.5, max: 10, step: 0.1 },
  { key: 'glowW', label: '泛光半径', min: 4, max: 48, step: 1 },
  { key: 'overshoot', label: '甩出px', min: 0, max: 80, step: 1 },
  { key: 'overshootRatio', label: '甩出比例', min: 0, max: 0.8, step: 0.02 },
  { key: 'previewAlpha', label: '预览亮度', min: 0.2, max: 1, step: 0.02 },
];

const LIGHT_SLIDERS: SliderSpec[] = [
  { key: 'keyIntensity', label: '主光强度', min: 0, max: 4, step: 0.05 },
  { key: 'fillIntensity', label: '补光强度', min: 0, max: 2, step: 0.05 },
  { key: 'hemiIntensity', label: '环境光', min: 0, max: 2, step: 0.05 },
  { key: 'keyYaw', label: '主光水平角', min: -180, max: 180, step: 1 },
  { key: 'keyPitch', label: '主光俯仰角', min: 5, max: 85, step: 1 },
  { key: 'keyDist', label: '主光距离', min: 2, max: 16, step: 0.1 },
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
    onLightChange: () => void;
  },
): { dispose: () => void } {
  const wrap = document.createElement('section');
  wrap.className = 'debug-panel';
  wrap.innerHTML = `
    <button type="button" class="debug-toggle">调试参数</button>
    <div class="debug-body" hidden>
      <p class="debug-sec">木头乘数（1 = 设计形体 ${WOOD_SHAPE.width}×${WOOD_SHAPE.height}×${WOOD_SHAPE.depth}）</p>
      <p class="debug-ratio" id="wood-ratio"></p>
      <div class="debug-wood"></div>
      <p class="debug-sec">灯光</p>
      <div class="debug-light"></div>
      <p class="debug-sec">物理</p>
      <div class="debug-sliders"></div>
      <p class="debug-sec">拖尾</p>
      <div class="debug-trail"></div>
      <p class="debug-sec">意图</p>
      <div class="debug-intent"></div>
      <p class="debug-sec">最后一刀</p>
      <div class="debug-finale"></div>
      <p class="debug-sec">切开特效</p>
      <div class="debug-fx"></div>
      <p class="debug-sec">震屏</p>
      <div class="debug-shake"></div>
      <p class="debug-sec">震动（马达）</p>
      <div class="debug-haptic"></div>
      <p class="debug-sec">刀光</p>
      <div class="debug-flash"></div>
      <div class="debug-actions">
        <button type="button" data-act="light">重置灯光</button>
        <button type="button" data-act="wood">重置木头</button>
        <button type="button" data-act="phys">重置物理</button>
        <button type="button" data-act="trail">重置拖尾</button>
        <button type="button" data-act="intent">重置意图</button>
        <button type="button" data-act="finale">重置终刀</button>
        <button type="button" data-act="fx">重置特效</button>
        <button type="button" data-act="shake">重置震屏</button>
        <button type="button" data-act="haptic">重置震动</button>
        <button type="button" data-act="flash">重置刀光</button>
      </div>
    </div>
  `;
  uiRoot.appendChild(wrap);
  blockStage(wrap);

  const body = wrap.querySelector('.debug-body') as HTMLElement;
  const woodBox = wrap.querySelector('.debug-wood') as HTMLElement;
  const lightList = wrap.querySelector('.debug-light') as HTMLElement;
  const list = wrap.querySelector('.debug-sliders') as HTMLElement;
  const trailList = wrap.querySelector('.debug-trail') as HTMLElement;
  const intentList = wrap.querySelector('.debug-intent') as HTMLElement;
  const finaleList = wrap.querySelector('.debug-finale') as HTMLElement;
  const fxList = wrap.querySelector('.debug-fx') as HTMLElement;
  const shakeList = wrap.querySelector('.debug-shake') as HTMLElement;
  const hapticList = wrap.querySelector('.debug-haptic') as HTMLElement;
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

  const lightInputs: { spec: SliderSpec; input: HTMLInputElement; val: HTMLSpanElement }[] =
    [];

  for (const spec of LIGHT_SLIDERS) {
    const row = document.createElement('label');
    row.className = 'debug-row';
    const cur = LIGHT[spec.key as keyof typeof LIGHT];
    row.innerHTML = `<span>${spec.label}</span><input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}" /><span class="debug-val"></span>`;
    const input = row.querySelector('input')!;
    const val = row.querySelector('.debug-val') as HTMLSpanElement;
    input.value = String(cur);
    val.textContent = Number(cur).toFixed(spec.step < 1 ? 2 : 0);
    input.addEventListener('input', () => {
      const n = Number(input.value);
      (LIGHT as Record<string, number>)[spec.key] = n;
      val.textContent = n.toFixed(spec.step < 1 ? 2 : 0);
      hooks.onLightChange();
    });
    lightList.appendChild(row);
    lightInputs.push({ spec, input, val });
  }

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

  const finaleBag = (key: string) =>
    key === 'finishRemain' ? CUT : FINALE;

  const finaleInputs: { spec: SliderSpec; input: HTMLInputElement; val: HTMLSpanElement }[] =
    [];

  for (const spec of FINALE_SLIDERS) {
    const row = document.createElement('label');
    row.className = 'debug-row';
    const bag = finaleBag(spec.key) as Record<string, number>;
    const cur = bag[spec.key];
    row.innerHTML = `<span>${spec.label}</span><input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}" /><span class="debug-val"></span>`;
    const input = row.querySelector('input')!;
    const val = row.querySelector('.debug-val') as HTMLSpanElement;
    input.value = String(cur);
    val.textContent = Number(cur).toFixed(spec.step < 1 ? 2 : 0);
    input.addEventListener('input', () => {
      const n = Number(input.value);
      bag[spec.key] = n;
      val.textContent = n.toFixed(spec.step < 1 ? 2 : 0);
    });
    finaleList.appendChild(row);
    finaleInputs.push({ spec, input, val });
  }

  const fxInputs: { spec: SliderSpec; input: HTMLInputElement; val: HTMLSpanElement }[] =
    [];

  for (const spec of FX_SLIDERS) {
    const row = document.createElement('label');
    row.className = 'debug-row';
    const cur = FX[spec.key as keyof typeof FX];
    row.innerHTML = `<span>${spec.label}</span><input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}" /><span class="debug-val"></span>`;
    const input = row.querySelector('input')!;
    const val = row.querySelector('.debug-val') as HTMLSpanElement;
    input.value = String(cur);
    val.textContent = Number(cur).toFixed(spec.step < 1 ? 2 : 0);
    input.addEventListener('input', () => {
      const n = Number(input.value);
      (FX as Record<string, number>)[spec.key] = n;
      val.textContent = n.toFixed(spec.step < 1 ? 2 : 0);
    });
    fxList.appendChild(row);
    fxInputs.push({ spec, input, val });
  }

  const shakeInputs: { spec: SliderSpec; input: HTMLInputElement; val: HTMLSpanElement }[] =
    [];

  for (const spec of SHAKE_SLIDERS) {
    const row = document.createElement('label');
    row.className = 'debug-row';
    const cur = SHAKE[spec.key as keyof typeof SHAKE];
    row.innerHTML = `<span>${spec.label}</span><input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}" /><span class="debug-val"></span>`;
    const input = row.querySelector('input')!;
    const val = row.querySelector('.debug-val') as HTMLSpanElement;
    input.value = String(cur);
    val.textContent = Number(cur).toFixed(spec.step < 1 ? 2 : 0);
    input.addEventListener('input', () => {
      const n = Number(input.value);
      (SHAKE as Record<string, number>)[spec.key] = n;
      val.textContent = n.toFixed(spec.step < 1 ? 2 : 0);
    });
    shakeList.appendChild(row);
    shakeInputs.push({ spec, input, val });
  }

  const hapticInputs: { spec: SliderSpec; input: HTMLInputElement; val: HTMLSpanElement }[] =
    [];

  for (const spec of HAPTIC_SLIDERS) {
    const row = document.createElement('label');
    row.className = 'debug-row';
    const cur = HAPTIC[spec.key as keyof typeof HAPTIC];
    row.innerHTML = `<span>${spec.label}</span><input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}" /><span class="debug-val"></span>`;
    const input = row.querySelector('input')!;
    const val = row.querySelector('.debug-val') as HTMLSpanElement;
    input.value = String(cur);
    val.textContent = Number(cur).toFixed(spec.step < 1 ? 2 : 0);
    input.addEventListener('input', () => {
      const n = Number(input.value);
      (HAPTIC as Record<string, number>)[spec.key] = n;
      val.textContent = n.toFixed(spec.step < 1 ? 2 : 0);
    });
    hapticList.appendChild(row);
    hapticInputs.push({ spec, input, val });
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
    for (const { spec, input, val } of lightInputs) {
      const n = LIGHT[spec.key as keyof typeof LIGHT];
      input.value = String(n);
      val.textContent = n.toFixed(spec.step < 1 ? 2 : 0);
    }
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
    for (const { spec, input, val } of finaleInputs) {
      const n = (finaleBag(spec.key) as Record<string, number>)[spec.key];
      input.value = String(n);
      val.textContent = n.toFixed(spec.step < 1 ? 2 : 0);
    }
    for (const { spec, input, val } of fxInputs) {
      const n = FX[spec.key as keyof typeof FX];
      input.value = String(n);
      val.textContent = n.toFixed(spec.step < 1 ? 2 : 0);
    }
    for (const { spec, input, val } of shakeInputs) {
      const n = SHAKE[spec.key as keyof typeof SHAKE];
      input.value = String(n);
      val.textContent = n.toFixed(spec.step < 1 ? 2 : 0);
    }
    for (const { spec, input, val } of hapticInputs) {
      const n = HAPTIC[spec.key as keyof typeof HAPTIC];
      input.value = String(n);
      val.textContent = n.toFixed(spec.step < 1 ? 2 : 0);
    }
    for (const { spec, input, val } of flashInputs) {
      const n = FLASH[spec.key as keyof typeof FLASH];
      input.value = String(n);
      val.textContent = n.toFixed(spec.step < 1 ? 2 : 0);
    }
  };

  wrap.querySelector('[data-act="light"]')!.addEventListener('click', (e) => {
    e.stopPropagation();
    Object.assign(LIGHT, LIGHT_DEFAULT);
    sync();
    hooks.onLightChange();
  });
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
  wrap.querySelector('[data-act="finale"]')!.addEventListener('click', (e) => {
    e.stopPropagation();
    Object.assign(CUT, CUT_DEFAULT);
    Object.assign(FINALE, FINALE_DEFAULT);
    sync();
  });
  wrap.querySelector('[data-act="fx"]')!.addEventListener('click', (e) => {
    e.stopPropagation();
    Object.assign(FX, FX_DEFAULT);
    sync();
  });
  wrap.querySelector('[data-act="shake"]')!.addEventListener('click', (e) => {
    e.stopPropagation();
    Object.assign(SHAKE, SHAKE_DEFAULT);
    sync();
  });
  wrap.querySelector('[data-act="haptic"]')!.addEventListener('click', (e) => {
    e.stopPropagation();
    Object.assign(HAPTIC, HAPTIC_DEFAULT);
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
