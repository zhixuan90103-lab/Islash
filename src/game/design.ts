/**
 * 划切玩法设计数据。改这里即改规则，不要在各模块里再写魔法数。
 *
 * 滑动 = 刀；盒子 = 木头。
 * 刀向 A→B 决定砍飞方向；滑速决定力度。未完成前只踢被砍下的块。
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
  width: 1.5,
  height: 1.5,
  depth: 1,
  lift: 0,
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
};

export const CUT_DEFAULT = { ...CUT };

export const VIEW = {
  fov: 45,
  cameraZ: 6.2,
  /** 参考作水色：中心亮青、四周偏蓝。 */
  bg: 0x2eb5e0,
  bgCenter: 0x6ad4f0,
  bgEdge: 0x0d6e9c,
  woodColor: 0xd4893a,
  hemiSky: 0xfff6e8,
  hemiGround: 0x1a6d8c,
  hemiIntensity: 0.9,
  keyColor: 0xfff4e6,
  keyIntensity: 1.45,
  /** 偏上、略靠镜头，倒角高光在上沿、暗边在左下。 */
  keyPos: [1.6, 7.2, 5.4] as const,
};

/** 出刀：采样、出刃、何时落刀。 */
export const SLASH = {
  armDist: 8,
  interpGap: 5,
  minChord: 8,
  hullChordRatio: 0.08,
};

/**
 * 意图帮助只管两点：起点 A、终点（青线进度）。
 * 速度越快补偿越大；最慢终点门槛 = 100%（必须真出边）。
 */
export const START = {
  /** 起点：最慢时的吸边半径（设计 px）。 */
  slowDist: 10,
  /** 起点：达到 fastSpeed 时的吸边半径。 */
  fastDist: 36,
  /** 速度尺子：达到此 px/s 视为「满补偿」。 */
  fastSpeed: 160,
  /** 终点：满补偿时的青线行程（0.8 = 80%）；速度 0 时为 1。 */
  endTravelFast: 0.8,
  /** 起点打分低于此不帮。 */
  scoreMin: 0.35,
  /** 帮助用最近这么多微段的中位速度。 */
  speedWindow: 4,
  /**
   * 已交刀直线的走廊半宽（设计 px）。
   * 刀尖还在走廊内且沿该方向 = 同一刀余势，不再锁 A / 补切 / 真出边。
   */
  corridor: 8,
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
  /** 1 = 画出预测弦 / 锁定弦 / 切开弦，方便对缝。 */
  debug: 0,
};

export const INTENT_DEFAULT = { ...INTENT };

/** 刀痕拖尾：最长像素；停手从尾收到指尖。life = 满长收到指尖的秒数。 */
export const TRAIL = {
  /** 1 = 画手指划痕。0 = 先藏起来看刀光。 */
  show: 1,
  /** 沿路径最长（设计 px）。滑再快也不超过。 */
  maxLen: 180,
  /** 满长收到指尖的时间（秒）。开始收回之后才算。 */
  life: 0.3,
  /** 低于此速度（px/s）视为停手。过大会把慢划当成停下。 */
  stopSpeed: 24,
  /** 判定停下后，再等这么久才开始收尾（秒）。手指微颤会刷新计时。 */
  still: 0.03,
  /** 新点最小间距。略大于微抖，仍跟上弯道。 */
  minDist: 1.5,
  /** 刀尖低通时间常数（秒）。只滤小抖，过大跟手变肉、轨迹变直。 */
  smooth: 0.02,
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
  /** 夹缝指尖（终点）线宽。 */
  crackW: 1.2,
  /** 夹缝入点基础宽度；随缝长再加宽。 */
  crackW0: 2.5,
  /** 缝每长 1px，入点宽度增加多少。 */
  crackGrow: 0.14,
  /** 入点宽度上限。 */
  crackWMax: 6.6,
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
