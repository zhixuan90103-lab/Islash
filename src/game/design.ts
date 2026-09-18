/**
 * 划切玩法设计数据。改这里即改规则，不要在各模块里再写魔法数。
 *
 * 滑动 = 刀；板 = 木头。
 * 未完成：大块留下、小块飞出。完成切割：两块都飞。
 * 刀向 A→B 决定砍飞方向；滑速决定力度。
 */

/** 木头设计形体（世界单位）。参数为 1 时按此尺寸建几何，不是正方体。 */
export const WOOD_SHAPE = {
  width: 0.7,
  height: 2,
  depth: 0.075,
  /**
   * 正面倒角宽度（世界单位）。侧面竖直；只在朝相机一圈做约 45° 倒角。
   * 切的是 2D 轮廓。锐角用半平面内收丢掉内顶点，不要锥台、不要整块降 inset。
   */
  frontInset: 0.028,
};

/** 倒角 XY 宽度；Z 向用同一值，斜角约 45°。 */
export function bevelInset(_depth: number): number {
  return WOOD_SHAPE.frontInset;
}

/** 长宽高乘数，默认 1 = 保持 WOOD_SHAPE。lift 为相对画面中心的 Y。 */
export const WOOD = {
  width: 1.75,
  height: 1.75,
  depth: 1,
  lift: 0,
  /** 木纹 UV：世界单位 × 此值。偏小避免一张板跨过 0/1 出现接缝。 */
  uvScale: 0.3,
  /** 正面漫反射色，乘木纹 map。未上漆木头不用镜面。 */
  faceColor: 0xfff3e4,
};

export function woodSize(): { width: number; height: number; depth: number } {
  return {
    width: WOOD_SHAPE.width * WOOD.width,
    height: WOOD_SHAPE.height * WOOD.height,
    depth: WOOD_SHAPE.depth * WOOD.depth,
  };
}

/**
 * 砍击上限：相对整板体积。切开后较大块低于此 = 完成切割，两块都飞。
 */
export const CUT = {
  finishRemain: 0.1,
  /** 完成切割、两块开始飞出后再等多久出下一板（秒）。 */
  nextDelay: 0.85,
  /** 新板轮廓包络上限（世界单位），保证落在画面内。 */
  boardMaxW: 2.15,
  boardMaxH: 4.1,
  /** 进场：从画面上方滑到中心的时长（秒）。 */
  enterDur: 0.48,
  /** 进场起点相对画面上边的余量。 */
  enterPad: 0.28,
};

export function viewHalfH(): number {
  return VIEW.cameraZ * Math.tan((VIEW.fov * Math.PI) / 360);
}

/** 进度相对能砍额度 origin * (1 - finishRemain)。完成切割钳到 1。 */
export function boardCutProgress(
  originVol: number,
  keepVol: number,
  finish: boolean,
): number {
  if (finish || originVol <= 1e-12) return 1;
  const quota = originVol * (1 - CUT.finishRemain);
  if (quota <= 1e-12) return 1;
  return Math.min(1, Math.max(0, (originVol - keepVol) / quota));
}

export const CUT_DEFAULT = { ...CUT };

/**
 * 图库（依次循环）。scale 为相对 `woodSize()` 面积的**线度**。
 * 长六边不跟面积对齐，用 `hexDiamondProfile` 世界尺寸。
 */
export const BOARDS = {
  circleScale: 0.81,
  squareScale: 0.8,
};

export const BOARDS_DEFAULT = { ...BOARDS };

/** 完成切割演出：先顿 → 慢放飞出 → 镜头/时间回 rest。 */
export const FINALE = {
  /** 顿帧（秒），只冻这一刀两块。慢放窗口与此相同。 */
  freeze: 0.1,
  /** 物理 dt 倍率。越小越慢。 */
  scale: 0.12,
  kickMul: 2.4,
  burst: 1.45,
  bladeScale: 1.55,
  glowScale: 1.25,
  /** 终刀光全长（设计 px），以切缝中点为中心向两边伸。 */
  bladeSpan: 380,
  bladeLife: 0.5,
  /** 终刀闪白峰值透明度。 */
  flashPeak: 0.22,
};

export const FINALE_DEFAULT = { ...FINALE };

export const VIEW = {
  fov: 45,
  cameraZ: 6.2,
  /** letterbox / 场景底色（红色青海波背景）。 */
  bg: 0xc44a3a,
  bgCenter: 0xe07058,
  bgEdge: 0x5c1814,
  woodColor: 0xf0c48a,
  /** 侧面 / 倒角底色，主要靠灯光打出厚度。 */
  woodChamfer: 0xe8c49a,
  hemiSky: 0xfff6ea,
  hemiGround: 0x8a5a40,
  keyColor: 0xfff3dc,
  fillColor: 0xfff8f2,
  /** 背景接影平面（木板在 z≈0 后面）。越靠近板，影子贴得越近。 */
  bgZ: -0.28,
  shadowOpacity: 0.38,
};

/** 灯光：强度 + 主光方位（度）。yaw 0=镜头方向，pitch 90=正上方。 */
export const LIGHT = {
  keyIntensity: 3.6,
  fillIntensity: 0,
  hemiIntensity: 1.4,
  keyYaw: -13,
  keyPitch: 44,
  keyDist: 6.9,
};

export const LIGHT_DEFAULT = { ...LIGHT };

export function lightKeyPos(): { x: number; y: number; z: number } {
  const yaw = (LIGHT.keyYaw * Math.PI) / 180;
  const pitch = (LIGHT.keyPitch * Math.PI) / 180;
  const d = LIGHT.keyDist;
  const cp = Math.cos(pitch);
  return {
    x: d * cp * Math.sin(yaw),
    y: d * Math.sin(pitch),
    z: d * cp * Math.cos(yaw),
  };
}

/** 出刀：采样、出刃、何时落刀。 */
export const SLASH = {
  armDist: 8,
  interpGap: 5,
  minChord: 4,
  hullChordRatio: 0.04,
};

/**
 * 意图帮助只管两点：起点 A、终点（青线进度）。
 * 速度越快补偿越大；最慢终点门槛 = 100%（必须真出边）。
 */
export const START = {
  /** 同时按下的触点上限。有效刀始终只有一把。 */
  maxStrokes: 3,
  /** 贴边发糊：最慢时吸到轮廓的半径（设计 px）。板心不锁。 */
  slowDist: 10,
  /** 贴边发糊：达到 fastSpeed 时的吸边半径。 */
  fastDist: 60,
  /** 速度尺子：达到此 px/s 视为「满补偿」。 */
  fastSpeed: 160,
  /** 终点：满补偿时的青线行程（0.75 = 75%）；速度 0 时为 1。 */
  endTravelFast: 0.75,
  /** 起点打分低于此不帮。 */
  scoreMin: 0.35,
  /**
   * 入点锁定前，刀尖离候选 A 至少这么远（px）。
   * 低于触控 slop 的第一段方向噪声会锁错边。
   */
  lockSlop: 14,
  /** 帮助用最近这么多微段的中位速度。 */
  speedWindow: 4,
  /**
   * 余势走廊半宽（设计 px）。
   * 只拦「切开后还顺着那条缝甩」。转走或离开走廊立刻结束余势，
   * 切开面可以当下一刀入边。
   */
  corridor: 8,
  /** 余势：段方向与已切方向点积大于此才算顺着走。 */
  alongMin: 0.15,
  /**
   * 尖角开第二刀：回看这么长（设计 px）的两段航向夹角。
   * 弧线摊在路上，局部夹角小；折线拐弯才大。
   */
  cornerSpan: 32,
  /** 两段航向点积低於此视为尖角（0.34 ≈ 70°）。 */
  cornerDot: 0.34,
  /** 点积低於此视为折返/直角，不再要求减速。 */
  cornerFlip: 0,
  /** 尖角还要刀速掉到巡航的这么多（直角以上可免）。 */
  cornerSlow: 0.75,
  /**
   * 锁 A 后板内路程 / A→出点直线。大于此本刀取消，钉死到出板。
   * 未切开就出板后再进是新刀，不必抬手。
   */
  pathChordMax: 1.5,
};

export const START_DEFAULT = { ...START };

/**
 * 切向意图：只驱动刀光，不改出边才切。
 * 锁定角严、解锁角宽，避免外推一帧失败就闪灭。
 */
export const INTENT = {
  /** 连续对准这么多微段才锁定。 */
  lockSegs: 2,
  /** 刀尖离开入点至少这么远才开始计锁定（px）。 */
  minFromEnter: 8,
  /** 段方向 vs 预测弦，小于此角才算对准（度）。 */
  lockAngle: 18,
  /** 已锁定后，大于此角才解锁（度）。 */
  unlockAngle: 34,
  /** 未锁定时低于此滑速不锁（px/s）。锁定后不停只因慢。 */
  minSpeed: 30,
  /** 1 = 画出凸包 / 青线 / 锁定弦 / 切开弦 / 消费走廊，方便对缝。 */
  debug: 0,
};

export const INTENT_DEFAULT = { ...INTENT };

/**
 * 手指划痕（时间制）。
 * 可见长度 = 最近 `life` 秒走出的路径，再钳 `maxLen`。
 * 快划长、慢划短但始终能看见；停住则旧点过期，尾巴自己收。
 */
export const TRAIL = {
  /** 1 = 画手指划痕。0 = 先藏起来看刀光。 */
  show: 1,
  /** 快划上限（设计 px）。慢划通常远短于此。 */
  maxLen: 220,
  /** 每个点活多久（秒）。抬手/停手后尾巴按此时间收掉；越小收得越快。 */
  life: 0.16,
  /** 结点最小间距。过小会把微抖画成折痕。 */
  minDist: 6,
  /** 刀尖低通（秒）。只滤小于 minDist 的微抖；0 = 完全跟手。 */
  smooth: 0,
  /** 绘制时每段 Catmull-Rom 细分。1 = 折线。 */
  subdiv: 6,
  headW: 6.5,
  tailW: 0,
  /** 刀尖三角沿前进方向探出（设计 px）。 */
  tipLen: 10,
  /** 预测点画 ahead 的透明度。0 = 空白处不画，避免被看成切缝刀光。 */
  predictAlpha: 0,
};

/**
 * 切缝刀光：纺锤、跟夹缝方向。提前闪与终点帮助同一 T(速度)；切开未闪过则必闪。
 */
export const FLASH = {
  /** 1 = 画直线刀光。0 = 先藏起来看夹缝。 */
  show: 1,
  /** 对准青线：段方向夹角大于此（度）不提前闪、不补出点。 */
  aimAngle: 10,
  /** 提前闪：对准需连续这么多微段。 */
  aimSegs: 5,
  /** 刀光扫过总时长（秒）。 */
  life: 0.3,
  /** 刚从入边出来、还短时的中段半宽（最宽）。 */
  coreW: 15,
  /** 拉满切缝时的中段半宽（最细）。 */
  coreWMin: 1.65,
  /** 变长阶段占寿命比例；其余时间拉满后淡出。 */
  grow: 0.55,
  /** 变长开始时已占全长的比例（避免第一帧过短）。 */
  growStart: 0.28,
  /** 外发光模糊半径（设计 px），一层 shadowBlur。 */
  glowW: 33,
  /** 沿夹缝方向拉长的最短刀光（设计 px）。短缝也按这个扫。 */
  spanMin: 300,
  /** 入端向外探出（px），刀光从板外起笔。 */
  overshootBack: 72,
  /** 出端再甩出（px）。 */
  overshoot: 42,
  /** 再按 span 比例甩出。 */
  overshootRatio: 0.15,
  /** 预览（未切开）相对切开的亮度。 */
  previewAlpha: 0.72,
  /** 夹缝颜色（贴近木板倒角深部，不要纯黑）。 */
  crackColor: 0xb1591a,
  /** 夹缝填充透明度。 */
  crackAlpha: 0.65,
  /**
   * 仅快滑：刀尖离锁 A 刀轴超过此 px 才藏缝。
   * 慢滑夹缝仍从 A 画到刀尖，转角跟着变。
   */
  crackLeave: 28,
  /** 低于此滑速（px/s）不藏缝，转角也照画。 */
  crackHoldSpeed: 280,
  /** 夹缝指尖（终点）线宽。 */
  crackW: 1.2,
  /** 夹缝入点基础宽度；随缝长再加宽。 */
  crackW0: 2.5,
  /** 缝每长 1px，入点宽度增加多少。 */
  crackGrow: 0.14,
  /** 入点宽度上限。 */
  crackWMax: 6.6,
  /** 乱划取消：夹缝从刀尖收回 A 的时长（秒）。 */
  crackRetract: 0.16,
};

/**
 * 砍击物理。方向：刀向 / 法线 / 朝屏幕 / 上挑。
 * 力度：Δv ≈ impulseBase * kickToSpeed * 滑速系数，J = mass * Δv。
 */
export const PHYS = {
  gravityY: -10.6,
  density: 2.6,
  friction: 0.85,
  restitution: 0.04,
  linearDamping: 0.7,
  angularDamping: 0.55,
  minSliceSpeed: 80,
  speedRef: 250,
  impulseBase: 0.75,
  wBlade: 0.2,
  wNormal: 0.35,
  wCam: 0.5,
  wLift: 0.4,
  bladeYScale: 0.4,
  maxUpFraction: 0.7,
  camYScale: 0.25,
  /** 冲量滑条换算成目标速度：Δv ≈ impulseBase * kickToSpeed（米/秒）。 */
  kickToSpeed: 4,
  maxSpeed: 4,
  maxSpin: 6,
};

/**
 * 切开震屏。只在网格切开成功时加；玩法相机仍用 rest，渲染前再叠偏移。
 * hit = clamp(speedK * sizeK, floor, 1)；trauma 累加封顶 1，振幅 trauma²。
 */
export const SHAKE = {
  /** 1 = 开。 */
  show: 1,
  /** 每刀创伤增量（乘 hit）。碎振用，不要当主位移。 */
  trauma: 0.22,
  /** trauma / 秒。 */
  decay: 8,
  /** 噪声最大平移。出击阶段不加，收回才叠一点。 */
  amp: 0.003,
  freq: 6,
  /** 踢的峰值位移（世界单位，再乘 hit）。 */
  kick: 0.01,
  /** 冲到峰值的时间（秒）。短=硬砍。 */
  attack: 0.01,
  /** 从峰值收回的时间（秒）。长=衰减柔和。 */
  settle: 0.22,
  roll: 0.02,
  floor: 0.08,
  /** 顿帧最短/最长（秒）。按 hit 插值；只冻物理，刀光/输入不停。 */
  freezeMin: 0.032,
  freezeMax: 0.1,
  /** 乱划取消：镜头沿 Z 推进（世界单位）。0 = 关。不走切开震屏。 */
  cancelPush: 0.06,
  /** 推到最近的时间（秒）。 */
  cancelPushIn: 0.13,
  /** 回到 rest 的时间（秒）。 */
  cancelPushOut: 0.1,
  /** 乱划取消：左右晃峰值（世界单位）。0 = 关。 */
  cancelWobble: 0.012,
  /** 左右晃时长（秒）。 */
  cancelWobbleDur: 0.22,
  /** 左右晃频率（次/秒）。 */
  cancelWobbleHz: 11,
};

/** 切开接触：碎屑、挤压、重砍闪、解冻加踢。 */
export const FX = {
  chips: 1,
  chipCount: 16,
  chipLife: 0.78,
  chipSpeed: 220,
  squeeze: 0.035,
  flashAt: 0.42,
  flashLife: 0.05,
  burst: 1.28,
};

export const WOOD_DEFAULT = { ...WOOD };
export const PHYS_DEFAULT = { ...PHYS };
export const TRAIL_DEFAULT = { ...TRAIL };
export const FLASH_DEFAULT = { ...FLASH };
export const SHAKE_DEFAULT = { ...SHAKE };
export const FX_DEFAULT = { ...FX };

export function bladeSpeedScale(speedPxPerSec: number): number {
  const v = Math.max(PHYS.minSliceSpeed, speedPxPerSec);
  return Math.min(1, v / PHYS.speedRef);
}

/**
 * 刀的触觉（Taptic，不是震屏）。
 * 锁 A：轻瞬态 + 弱持续（渐起，最长 maxHold）。
 * 切开成功：停持续 → 更强更锐的瞬态。失败 / 抬手 / 走廊余势：只停，不打结束击。
 */
export const HAPTIC = {
  enterI: 0.3,
  enterS: 0.24,
  holdI: 0.16,
  holdS: 0.6,
  /** 持续渐起（秒）。 */
  attack: 0.15,
  /** 硬上限（秒）。到点自动停，不拖到插件 30s 帽。 */
  maxHold: 2,
  cutI0: 0.4,
  cutI1: 0.65,
  cutS0: 0.3,
  cutS1: 0.5,
  /** 完成切割时切开瞬态强度倍率。 */
  finishMul: 1.5,
};

export const HAPTIC_DEFAULT = { ...HAPTIC };

/**
 * 划切音效。
 * 滑动 whoosh：只在板上、每刀一次，按时长拉伸（慢→最长 slideMaxDur）。
 * 裂木：切开成功；音量/音调跟切开大小 + 刀速。
 */
export const SFX = {
  speedRef: 250,
  /** 慢划把 whoosh 拉到这么长（秒），不超过 1。 */
  slideMaxDur: 1,
  /** 快划最短播放（秒）。 */
  slideMinDur: 0.22,
  volSlow: 0.16,
  volFast: 0.42,
  crackVol: 0.7,
  /** 小块切开的音调倍率（更尖）。大块用 crackRateBig。 */
  crackRateSmall: 1.18,
  crackRateBig: 0.82,
  finishCrackMul: 1.16,
};

export const SFX_DEFAULT = { ...SFX };
