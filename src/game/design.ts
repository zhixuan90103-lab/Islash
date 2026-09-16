/**
 * 划切玩法设计数据。改这里即改规则，不要在各模块里再写魔法数。
 *
 * 滑动 = 刀；盒子 = 木头。
 * 刀向 A→B 决定砍飞方向；滑速决定力度。只踢被砍下的块。
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
  width: 1,
  height: 1,
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
 * 入点辅助：只看按下点离边多近，拖近边缘不算。
 * 慢=吸按下点最近边；快=沿刀向回投，若打到对边则仍吸近边。
 */
export const START = {
  /** 慢划：到边距离 ≤ 此值才吸边（设计 px）。 */
  slowDist: 10,
  /** 慢划：最近边必须比第二近至少远这么多，否则当转角不吸。 */
  slowClear: 8,
  /** 快划：到边距离 ≤ 此值才回投/吸边。 */
  fastDist: 36,
  /** 达到此滑速用快档（px/s）。 */
  fastSpeed: 160,
  /** 转角：按下后至少挪这么远才用刀向在两条近边里选入边。 */
  cornerMove: 10,
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

/** 刀痕拖尾：点寿命（秒），刀尖宽、尾细。寿命太短则慢划几乎看不见。 */
export const TRAIL = {
  /** 1 = 画手指划痕。0 = 先藏起来看刀光。 */
  show: 1,
  life: 0.24,
  minDist: 0.5,
  headW: 5,
  tailW: 0,
  /** 预测点画 ahead 的透明度。0 = 空白处不画，避免被看成切缝刀光。 */
  predictAlpha: 0,
};

/**
 * 切缝刀光：直线、两头尖、外发光。长度 = 本次切缝弦长 + 两端甩出。
 * 方向能贯穿时预览；出边切开后加亮再淡出。不是手指折线。
 */
export const FLASH = {
  /** 1 = 画直线刀光。0 = 先藏起来看夹缝。 */
  show: 1,
  /** 预览刀光最低滑速（px/s）。只决定提前亮的时刻；贯穿切开时一定闪。 */
  minSpeed: 180,
  /** 已出刀光后，低于此速才熄（滞回）。现码未读；提前刀光每刀最多一次。 */
  minSpeedOff: 110,
  /** 提前刀光：段方向 vs 预测弦，大于此角不出。 */
  aimAngle: 10,
  /** 提前刀光：对准需连续这么多微段。 */
  aimSegs: 5,
  /** 提前刀光 / 快划补出边：手指沿青线走到全长的这个比例。慢划不补出边。 */
  minTravelRatio: 0.85,
  /** 刀光扫过总时长（秒）。 */
  life: 0.3,
  /** 刚从入边出来、还短时的中段半宽（最宽）。 */
  coreW: 10,
  /** 拉满切缝时的中段半宽（最细）。 */
  coreWMin: 1.1,
  /** 变长阶段占寿命比例；其余时间拉满后淡出。 */
  grow: 0.55,
  /** 外发光模糊半径（设计 px），一层 shadowBlur。 */
  glowW: 22,
  /** 沿夹缝方向拉长的最短刀光（设计 px）。短缝也按这个扫。 */
  spanMin: 200,
  /** 入端向外探出（px），刀光从板外起笔。 */
  overshootBack: 48,
  /** 出端再甩出（px）。 */
  overshoot: 28,
  /** 再按 span 比例甩出。 */
  overshootRatio: 0.1,
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
  gravityY: -8.0,
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

export const WOOD_DEFAULT = { ...WOOD };
export const PHYS_DEFAULT = { ...PHYS };
export const TRAIL_DEFAULT = { ...TRAIL };
export const FLASH_DEFAULT = { ...FLASH };

export function bladeSpeedScale(speedPxPerSec: number): number {
  const v = Math.max(PHYS.minSliceSpeed, speedPxPerSec);
  return Math.min(1, v / PHYS.speedRef);
}
