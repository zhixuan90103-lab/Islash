# 划切意图识别规范

参数真源：`src/game/design.ts`（`START` / `INTENT` / `FLASH` / `TRAIL`）。  
状态机：`src/game/slashIntent.ts`（`stepSlashIntent`）。  
本划状态：`src/game/slashInput.ts`（`progress` / `follow`）。余势：`src/game/slashFollow.ts`。  
几何：`src/game/slashHit.ts`。绘制：`src/game/slashDebug.ts`。  
玩法总则：[SLASH-DESIGN.md](./SLASH-DESIGN.md)。

本文是**当前已落地规则**，不是待办。

## 原则

1. **宁可不帮助，但要精准。** 不确定就不补 A、不补出点。
2. **真贯穿必须有响应。** 一条边进、另一条边出（且缝够深）一定要切。切开后同一划的尾巴（还在刚切开的块上，或仍顺着缝）不算第二刀。离开这些块再进（含切开面）才是新刀。
3. **提交和反馈分开。** 夹缝 / 刀光不是切开。
4. **帮助只管两点**：起点 A、终点（青线进度）。同一套速度尺子，不叠特例。
5. **一划不是一次按下。** 一次按下可以多刀；一刀是一条 A→B。切开后尾巴仍是这一刀，直到离开刚切开的块且不再顺着缝。

## 三层

| 层 | 何时生效 | 失败时 |
|----|----------|--------|
| **提交** | 进出两条不同边，弦够深 | 同边蹭不算 |
| **帮助** | 起点打分锁 A；终点对准青线且行程 ≥ T(速度) 则补出点 | 不帮：等真入边 / 真出边 |
| **余势** | 网格切开成功后 `beginFollow` | 切开失败不写。尾巴拦住新刀 |

速度越快，起点半径越大、终点 T 越低。最慢 T = **100%**（必须真出边才交）。

## 几何用语

| 名 | 定义 |
|----|------|
| **青线** | 入点 A 沿当前刀向无限直线裁凸包，两端都在轮廓上。是「若这样划会切哪条缝」，不是已划路程。 |
| **行程** | 手指在青线上的投影 / 青线全长。终点帮助与提前刀光都用 `T(速度)`。 |
| **夹缝** | 入边 A → 当前刀尖（裁在包内）。 |
| **A** | 本刀入点。`enterLock`：`meshId` + 板上局部 XY。屏上位置每帧重投，跟板走。 |
| **余势** | `follow`：刚切开的缝 + keep/drop。同一划的尾巴。 |
| **走廊** | 整段到该缝距离 ≤ `START.corridor`（穿过也算），且方向点积 > `alongMin`。 |

## 提交（必须切）

1. **从板外进入**（微段外→内，交点为 A），或起点帮助锁 A。板心按下再拖出去 **不记刀**。
2. **出另一条边**（或快划补出点）。同一条边进出不算。
3. **切缝够深**：弦长 ≥ `max(minChord, hullChordRatio × 包围盒短边)`（`throughThreshold`）。默认 4px 与 4%。
4. **不在余势里**（见下）。
5. **板内不乱绕**：锁 A 后凸包内路程 / A→出点直线 ≤ `START.pathChordMax`（默认 1.4）。真出边和板内补切都比。超了不切开。
6. **抬手停在板内不切。** `pointercancel` 收刀，已切的保留。
7. 网格切开失败**不**写余势，并恢复本刀 `progress`，同一条线仍可再交。  
   出边时微段没裁到凸包：用锁死的 A→刀尖无限直线出点再判两边/深度。未切开就出板则清 A，再进是新刀（不必抬手）。板心按下再拖出仍不记刀。

同段微段从外贯穿且两边不同、弦够深 → 本段立刻提交。

## 帮助（可以不帮）

速度尺子 `t = clamp(中位速度 / fastSpeed, 0, 1)`。每微段只往窗口推一次，中位取最近 `speedWindow` 段。帮助吸边、青线补切、提前刀光、快滑藏缝共用这一把尺子。砍飞力度不走这里。

### 起点 A

A **只写一次**（`stroke.enterLock`，带 `meshId` + 板上局部 XY）。已锁 = `enterLock` 有值。夹缝每帧把 A 投回屏幕，新板滑入时跟着走。切开成功、抬手、跟踪的那块 mesh 没了、或未切开就出板才清空。弯刀不得改 A（板上那个点）。不得把 A 复用到另一块活板上。出板后再进重新锁 A，不必抬手。

如何锁：

1. 真入板：从刀尖沿轨迹**往回最多约 100px** 找最近一次板外点，与刀尖求交。不用整划最远的旧点（否则右侧进来会锁到左侧，板下滑时会锁到顶边）。  
2. 刀尖离候选 A ≥ `START.lockSlop`（14px）才写入。更短当噪声。  
3. 写入后板上那个局部点不改；屏上位置跟板走。  
4. 板心按下且从未出过板：不记刀。帮助锁**离刀尖最近的那条边**（入边，不是穿出对边）。

半径 = `lerp(slowDist, fastDist, t)`。距边超过半径则不帮，等真从板外进。

### 终点（青线）

须已有 A。青线 = A 打穿整板。段方向须对准青线（≤ `FLASH.aimAngle`）。  
`T = lerp(1.0, endTravelFast, t)`：最慢 **100%**（不补），满速 **80%** 可补。  
补切：`c0` = A，`c1` = 青线出点。未消费的线真出另一条边不看 T，一定切。

帮助只作用于**尚未交刀**的这一刀。切完 mesh 换了之后，不再对留下的块重新打分锁 A；那是余势的事。

## 余势（同一划的尾巴）

实现：`src/game/slashFollow.ts`。只在 **`cutMeshBySlash` 成功** 后 `beginFollow`。帮助补切和真出边一样。同时最多一条。

帮助切会提前交刀，手指往往还在板上。余势把这段尾巴当成还是第一刀，避免对角/弯划在留下块尖角再进出一次。

1. 记下切开弦、`keepId`、`dropId`。
2. **拦住新刀**：整段仍扫过走廊且方向顺着，**或者刀尖还在刚切开的任一块凸包里**（弯着划也算尾巴）。
3. **离开这两块且不再顺着**：余势结束；结束的那一段也不交刀。
4. **折返**（点积 < −0.15 且扫过走廊）：立刻结束，反向可切。
5. **抬手**：`follow = null`。
6. 出板再进（含切开面）才是新刀。还在块上转腕不算新刀。

## 反馈

绘制顺序（下→上）：**夹缝 → 刀光 → 手指划痕**。对缝调试彩线最上。

### 夹缝

- 从锁死的 A 画到刀尖，**不出板**。刀尖离开凸包立刻不画。  
- 慢滑：终点跟刀尖，转角跟着变。快滑（≥ `crackHoldSpeed`）且刀尖离锁 A 刀轴 > `crackLeave` 则藏缝（避免画圈乱晃）。  
- 入口宽（随缝长加到 `crackWMax`）、指尖细（`crackW`），色 `crackColor` `#b1591a`，透明度 `crackAlpha` 0.65。
- 进板即可画，不必等刀光锁定。
- 余势拦住时不对留下的新块跟手画夹缝。

### 刀光（`FLASH`）

- 纺锤：两头细、中间宽。方向跟夹缝。入端从板外 `overshootBack` 起笔，出端按 `spanMin` + 甩出拉长。
- 动画 0.3s：从入边变长（起始已占全长 `growStart` 28%），短时宽、拉满时细，然后淡出。
- **提前闪**：已锁 + 对准青线 `aimSegs` 段 + 行程 ≥ **同一 T(速度)**。每刀最多一次。最慢 T=100%，不会提前闪。余势拦住时没有青线，不提前闪。乱划路程超标（本刀将取消）不出刀光。
- **提交闪**：本刀还没提前闪过，切开必须闪。屏幕上同时只播一条。乱划取消没有提交闪。

### 划痕（`TRAIL`）

时间制丝带：可见段 = 最近 `life` 秒的触点路径，再钳 `maxLen`。快划长、慢划短但始终能看见。抬手或停手后点过期，尾巴按 `life` 收掉。触点走 `onTip`，不进切开判定。绘制：弧长重采样 + 圆内点 + 向心 Catmull-Rom。停住/抬手：旧点过期，尾巴自己收。刀尖三角 `tipLen`。`predictAlpha` 0。参数见下表；模块 `slashTrail.ts`，调研 [SLASH-TRAIL.md](./SLASH-TRAIL.md)。

### 对缝调试

`INTENT.debug = 1`：绿虚 = 凸包，青 = 青线，黄 = 本划第 1 刀，粉粗 = 第 2 刀，橙 = 余势，灰虚 = 刚清掉的余势，白 = 当前微段。默认关；调试面板「对缝调试」可开。乱划取消时 why 为 `乱划路程 N×`。

## 状态机

`stepSlashIntent` 每微段：写入速度样本 → 夹缝 → `resolveCutBySegment`（先 `stepFollow`）→ 青线 / 刀光锁 → 提前闪谓词。

`slashWorld` 只编排：`setCrack` → 若 `commit` 则切网格（成功才 `beginFollow` / 顿帧 / 闪）→ 否则 `earlyFlash`。滑入中途切开：入场 Y 只继续带 keep。夹缝在 `step` 里按板上局部 A 每帧重投。

`INTENT.unlockAngle` 只灭刀光锁，不丢本刀 `progress`。

相位：`idle` / `arming` / `track` / `aimed` / `hold`（余势拦住）。

## 参数表

### `START`

| 键 | 默认 | 作用 |
|----|------|------|
| slowDist / fastDist | 10 / 36 | 起点半径：最慢 / 满速 |
| fastSpeed | 160 | 速度尺子满档 |
| endTravelFast | 0.8 | 满速终点行程门槛（最慢为 1） |
| scoreMin | 0.35 | 起点总分低于此不帮 |
| lockSlop | 14 | 锁 A 前刀尖离候选入点的最短距离 |
| speedWindow | 4 | 中位速度段数 |
| corridor | 8 | 余势走廊半宽（整段到缝的距离；穿过为 0） |
| alongMin | 0.15 | 余势：段方向点积大于此才算顺着走 |
| pathChordMax | 1.4 | 板内路程 / A→出点直线上限；超了本刀不算。调试面板「乱划路程比」 |

### `INTENT`

| 键 | 默认 | 作用 |
|----|------|------|
| lockSegs / minFromEnter | 2 / 8 | 刀光锁定段数、离入点 |
| lockAngle / unlockAngle | 18 / 34 | 锁定角 / 解锁角（度） |
| minSpeed | 30 | 未锁时低于此不锁刀光 |
| debug | 0 | 对缝彩线（刀数 / 余势清掉 / 第2刀） |

### `FLASH`（节选）

| 键 | 默认 | 作用 |
|----|------|------|
| aimAngle / aimSegs | 10 / 5 | 对准青线（补切与提前闪） |
| life / grow / growStart | 0.3 / 0.55 / 0.28 | 时长与变长 |
| coreW / coreWMin | 15 / 1.65 | 短时最宽 / 满时最细（半宽） |
| spanMin / overshootBack / overshoot | 300 / 72 / 42 | 长度与两端探出 |
| crackColor / crackAlpha | `#b1591a` / 0.65 | 夹缝色与透明度 |
| crackLeave / crackHoldSpeed | 28 / 280 | 快滑离轴藏缝（px / px/s） |
| crackW / crackW0 / crackGrow / crackWMax | 1.2 / 2.5 / 0.14 / 6.6 | 指尖宽、入点宽 |

### `TRAIL`

| 键 | 默认 | 作用 |
|----|------|------|
| maxLen / life | 220 / 0.16 | 快划上限 px；点寿命秒（抬手/停手收回；慢划长度 ≈ 速度 × life） |
| minDist / smooth / subdiv | 6 / 0 / 6 | 结点间距、微抖低通秒、Catmull-Rom 细分 |
| headW / tailW / tipLen | 6.5 / 0 / 10 | 刀尖宽、尾宽、三角探出 |
| predictAlpha | 0 | 预测点不画 |

### `SLASH`（提交深度，真源在设计总则）

`armDist` 8、`interpGap` 5、`minChord` 4、`hullChordRatio` 0.04。弦长 ≥ `max(minChord, 短边×hullChordRatio)`。

## 模块

| 文件 | 职责 |
|------|------|
| `design.ts` | `START` / `INTENT` / `FLASH` / `TRAIL` |
| `slashInput.ts` | 指针折线；`follow`；`progress`；`enterLock` |
| `slashFollow.ts` | 余势：尾巴拦住新刀 |
| `slashIntent.ts` | 政策：锁 A、补切、青线、夹缝、提前闪 |
| `slashWorld.ts` | 切网格（成功才 `beginFollow`）、顿帧、物理、进场、overlay |
| `slashHit.ts` | 凸包、裁线、屏↔板局部 XY |
| `slashDebug.ts` | 夹缝 / 刀光 / 碎屑 / 闪 overlay |
| `slashTrail.ts` | 手指划痕（时间制） |
| `cutTarget.ts` | 兼容 re-export，勿再写政策 |

## 刻意不做 / 已删的补丁

邻边 22% 深度；用夹角挡真出边；`assistHold`；转角专用分支；独近 8px；固定 85%；刀光独立 180px/s；`lastSlash` 趋势闸；`awaitBlank` 空缝闸。  
不做：推测性切开再撤回；板心拖出当贯穿；ML。马达已接 `slashHaptics.ts`。
屏幕震屏见 [SLASH-FEEL.md](./SLASH-FEEL.md)，不是本文件的「震动」。
