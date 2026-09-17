# 划切意图识别规范

参数真源：`src/game/design.ts`（`START` / `INTENT` / `FLASH` / `TRAIL`）。  
状态机：`src/game/slashIntent.ts`（`stepSlashIntent`）。  
本划状态：`src/game/slashInput.ts`（`progress` / `consumed`）。  
几何：`src/game/slashHit.ts`。绘制：`src/game/slashDebug.ts`。  
玩法总则：[SLASH-DESIGN.md](./SLASH-DESIGN.md)。

本文是**当前已落地规则**，不是待办。

## 原则

1. **宁可不帮助，但要精准。** 不确定就不补 A、不补出点。
2. **真贯穿必须有响应。** 一条边进、另一条边出（且缝够深）一定要切。只有「切开后还顺着同一条缝甩」才是余势。转走再进，包括从切开面进，是新刀。
3. **提交和反馈分开。** 夹缝 / 刀光不是切开。
4. **帮助只管两点**：起点 A、终点（青线进度）。同一套速度尺子，不叠特例。
5. **一划不是一次按下。** 一次按下可以多刀；一刀是一条 A→B 趋势。帮助交过的线，继续滑不再出刀。方向横走离开该线，或沿该线折返，才是新刀。

## 三层

| 层 | 何时生效 | 失败时 |
|----|----------|--------|
| **提交** | 进出两条不同边，弦够深 | 同边蹭不算 |
| **帮助** | 起点打分锁 A；终点对准青线且行程 ≥ T(速度) 则补出点 | 不帮：等真入边 / 真出边 |
| **消费** | 网格切开成功后写入有向无限直线 | 切开失败不写。走廊内余势不开新刀 |

速度越快，起点半径越大、终点 T 越低。最慢 T = **100%**（必须真出边才交）。

## 几何用语

| 名 | 定义 |
|----|------|
| **青线** | 入点 A 沿当前刀向无限直线裁凸包，两端都在轮廓上。是「若这样划会切哪条缝」，不是已划路程。 |
| **行程** | 手指在青线上的投影 / 青线全长。终点帮助与提前刀光都用 `T(速度)`。 |
| **夹缝** | 入边 A → 当前刀尖（裁在包内）。 |
| **A** | 本刀入点。写入 `enterLock`（含 `meshId`）+ `progress.c0` 后本刀不改。 |
| **已消费直线** | 本划刚切开的缝。只在顺着甩时有效；转走或离开走廊即清空。 |
| **走廊** | 刀尖到该缝的横向距离 ≤ `START.corridor`，且段方向点积 > `alongMin`。 |

## 提交（必须切）

1. **从板外进入**（微段外→内，交点为 A），或起点帮助锁 A。板心按下再拖出去 **不记刀**。
2. **出另一条边**（或快划补出点）。同一条边进出不算。
3. **切缝够深**：弦长 ≥ `max(minChord, hullChordRatio × 包围盒短边)`（`throughThreshold`）。默认 4px 与 4%。
4. **该线尚未被本划消费**（见下）。
5. **抬手停在板内不切。** `pointercancel` 收刀，已切的保留。
6. 网格切开失败**不**写 `consumed`，并恢复本刀 `progress`，同一条线仍可再交。  
   出边时微段没裁到凸包：用锁死的 A→刀尖无限直线出点再判两边/深度。假出边不丢 A。板心按下再拖出仍不记刀。

同段微段从外贯穿且两边不同、弦够深 → 本段立刻提交。

## 帮助（可以不帮）

速度尺子 `t = clamp(中位速度 / fastSpeed, 0, 1)`。每微段只往窗口推一次，中位取最近 `speedWindow` 段。帮助吸边、青线补切、提前刀光、快滑藏缝共用这一把尺子。砍飞力度不走这里。

### 起点 A

A **只写一次**（`stroke.enterLock`，带 `meshId`）。已锁 = `enterLock` 有值（夹缝从该点起笔）。切开成功、抬手、或跟踪的那块 mesh 没了才清空。弯刀、夹缝回投都不得改 A。不得把 A 复用到另一块活板上。

如何锁：

1. 真入板：本划**最后一个板外点 → 当前刀尖**与凸包求交（不用单段 5px 微段当整刀方向）。  
2. 刀尖离候选 A ≥ `START.lockSlop`（14px）才写入。更短当噪声。  
3. 写入后本刀不改 `c0` / `enterEdge` / `dir`。  
4. 板心按下且从未出过板：不记刀。帮助只看按下点→刀尖，同样要过 slop。

每条凸包边得分 = **0.55 × 近** + **0.45 × 刀向穿入该边**。  
半径 = `lerp(slowDist, fastDist, t)`。距边超过半径则该边不参与。  
两端都贴某条已消费直线的边不当入边。  
总分 ≥ `scoreMin` 才锁 A 到该边上最近点。否则不帮，等真从板外进。

### 终点（青线）

须已有 A。青线 = A 打穿整板。段方向须对准青线（≤ `FLASH.aimAngle`）。  
`T = lerp(1.0, endTravelFast, t)`：最慢 **100%**（不补），满速 **80%** 可补。  
补切：`c0` = A，`c1` = 青线出点。未消费的线真出另一条边不看 T，一定切。

帮助只作用于**尚未交刀**的这一刀。切完 mesh 换了之后，不再对留下的块重新打分锁 A；那是消费层的事。

## 已消费直线（余势）

只在 **`cutMeshBySlash` 成功** 后由 `consumeCutLine` 写入。帮助补切和真出边一样。本划可有多条。

口径：**余势只拦「这一刀还没甩完」。** 不抬手也可以开新刀。

切开成功后记下那条缝。只有刀尖还在 8px 走廊里 **并且** 段方向仍顺着切（点积 > `alongMin`）才拦截。一旦转走（约 90°）或离开走廊，名单立刻清空。之后从哪条边进都可以，**包括刚切开的平缝**。

| 情况 | 行为 |
|------|------|
| 走廊内且仍沿该方向 | 同一刀余势：禁锁 A、禁提交 |
| 转走 / 横穿 / 离开走廊 | 余势结束，可立刻切留下块（切开面可当入边） |
| 沿该线折返（点积 < −0.15） | 丢掉这条，反向可切 |
| 抬手 | `consumed` 清空 |

不要用整屏无限直线当「永远不能穿过的墙」。橙带只在余势还有效时出现。

## 反馈

绘制顺序（下→上）：**夹缝 → 刀光 → 手指划痕**。对缝调试彩线最上。

### 夹缝

- 从锁死的 A 画到刀尖，**不出板**。刀尖离开凸包立刻不画。  
- 慢滑：终点跟刀尖，转角跟着变。快滑（≥ `crackHoldSpeed`）且刀尖离锁 A 刀轴 > `crackLeave` 则藏缝（避免画圈乱晃）。  
- 入口宽（随缝长加到 `crackWMax`）、指尖细（`crackW`），色 `crackColor` `#b1591a`，透明度 `crackAlpha` 0.65。
- 进板即可画，不必等刀光锁定。
- 走廊占用时不对留下的新块跟手画夹缝。

### 刀光（`FLASH`）

- 纺锤：两头细、中间宽。方向跟夹缝。入端从板外 `overshootBack` 起笔，出端按 `spanMin` + 甩出拉长。
- 动画 0.3s：从入边变长（起始已占全长 `growStart` 28%），短时宽、拉满时细，然后淡出。
- **提前闪**：已锁 + 对准青线 `aimSegs` 段 + 行程 ≥ **同一 T(速度)**。每刀最多一次。最慢 T=100%，不会提前闪。走廊占用时没有青线，不提前闪。
- **提交闪**：本刀还没提前闪过，切开必须闪。屏幕上同时只播一条。

### 划痕（`TRAIL`）

时间制丝带：可见段 = 最近 `life` 秒的触点路径，再钳 `maxLen`。快划长、慢划短但始终能看见。抬手或停手后点过期，尾巴按 `life` 收掉。触点走 `onTip`，不进切开判定。绘制：弧长重采样 + 圆内点 + 向心 Catmull-Rom。停住/抬手：旧点过期，尾巴自己收。刀尖三角 `tipLen`。`predictAlpha` 0。参数见下表；模块 `slashTrail.ts`，调研 [SLASH-TRAIL.md](./SLASH-TRAIL.md)。

### 对缝调试

`INTENT.debug = 1`：绿虚 = 投影凸包，青 = 青线，粉 = 锁定弦，黄 = 真切开，橙带 = 已消费走廊，红点 A = 入点，红虚 = 意图过了但轮廓没切开。左上角写本段未切原因。默认关；调试面板「对缝调试」可开。

## 状态机

`stepSlashIntent` 每微段：写入速度样本 → 释放折返线 → 夹缝 → `resolveCutBySegment` → 青线 / 刀光锁 → 提前闪谓词。

`slashWorld` 只编排：`setCrack` → 若 `commit` 则切网格（成功才 `consumeCutLine` / `freezeFlash` / `commitFlash`）→ 否则 `earlyFlash`。

`INTENT.unlockAngle` 只灭刀光锁，不丢本刀 `progress`。

相位：`idle` / `arming` / `track` / `aimed` / `hold`（走廊占用）。

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
| corridor | 8 | 已交刀直线走廊半宽（设计 px） |
| alongMin | 0.15 | 余势：段方向点积大于此才算顺着走 |

### `INTENT`

| 键 | 默认 | 作用 |
|----|------|------|
| lockSegs / minFromEnter | 2 / 8 | 刀光锁定段数、离入点 |
| lockAngle / unlockAngle | 18 / 34 | 锁定角 / 解锁角（度） |
| minSpeed | 30 | 未锁时低于此不锁刀光 |
| debug | 0 | 对缝彩线（凸包 / 青 / 粉 / 黄 / 走廊 / 失败原因） |

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
| `slashInput.ts` | 指针折线；`consumed[]`；`progress`；`enterLock` |
| `slashIntent.ts` | 政策：锁 A、补切、消费走廊、青线、夹缝几何、提前闪 |
| `slashWorld.ts` | 切网格（成功才 `consumeCutLine`）、顿帧、物理、overlay |
| `slashHit.ts` | 凸包、裁线 |
| `slashDebug.ts` | 夹缝 / 刀光 / 碎屑 / 闪 overlay |
| `slashTrail.ts` | 手指划痕（时间制） |
| `cutTarget.ts` | 兼容 re-export，勿再写政策 |

## 刻意不做 / 已删的补丁

邻边 22% 深度；用夹角挡真出边；`assistHold`；转角专用分支；独近 8px；固定 85%；刀光独立 180px/s；`lastSlash` 趋势闸；`awaitBlank` 空缝闸。  
不做：推测性切开再撤回；板心拖出当贯穿；ML。马达已接 `slashHaptics.ts`。
屏幕震屏见 [SLASH-FEEL.md](./SLASH-FEEL.md)，不是本文件的「震动」。
