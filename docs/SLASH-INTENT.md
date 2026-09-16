# 划切意图识别规范

参数真源：`src/game/design.ts`（`START` / `INTENT` / `FLASH` / `TRAIL`）。  
状态机：`src/game/slashIntent.ts`（`stepSlashIntent`）。  
几何：`src/game/slashHit.ts`。绘制：`src/game/slashDebug.ts`。  
玩法总则：[SLASH-DESIGN.md](./SLASH-DESIGN.md)。

本文是**当前已落地规则**，不是待办重构。

## 原则

1. **宁可不帮助，但要精准。** 入点吸附、快划 85% 补出边可以不帮；不确定就不补。
2. **真贯穿必须有响应。** 已经从一条边进、另一条边出（且切缝够深），一定要切。不能「划穿了没反应」。
3. **提交和反馈分开。** 切开 mesh 是提交；夹缝 / 刀光 / 划痕是反馈。禁止先切开再撤回。

## 两层

| 层 | 何时生效 | 失败时 |
|----|----------|--------|
| **提交** | 进出两条不同凸包边，且切缝够深 | 同边蹭、尖角擦边（弦太短）不算 |
| **帮助** | 近边吸 A；快划沿青线走到 85% 且对准则补出点 | 不补；等玩家划穿 |

慢划不补出点、不提前刀光。快划帮助用**近几段中位速度**，单段尖刺不算快。

## 几何用语

| 名 | 定义 |
|----|------|
| **青线** | 入点 A 沿当前刀向无限直线裁凸包，两端都在轮廓上。是「若这样划会切哪条缝」，不是已划路程。 |
| **行程** | 手指在青线上的投影长度 / 青线全长。板心约 0.5；`FLASH.minTravelRatio` **0.85** 才允许快划补切 / 提前刀光。 |
| **夹缝** | 入边 A → 当前刀尖（裁在包内）。 |
| **A** | 本刀入点，锁在 `progress.c0`，不再漂。 |

## 提交（必须切）

1. **从板外进入**（微段外→内，交点为 A），或入点辅助成立（见下）。板心按下再拖出去 **不记刀**。
2. **出另一条边**（或快划补出点，见帮助）。同一条边进出不算。
3. **切缝够深**：至少 `SLASH.minChord` 与 `hullChordRatio × 包围盒短边`。进出是**相邻边**时还要 ≥ `START.cornerMinChord`（0.22）× 短边，挡住尖角擦边；对角贯穿、大切角仍过。
4. **A→B 趋势（不是「不抬手只能一刀」）**：
   - 一次趋势 = 入点 A 沿一个方向到出点 B。
   - **只挡续切**：新刀线与上一刀 **几乎同向**（夹角 ≤ `trendAngle` 5°）**且贴着上一条缝**（距离 ≤ `trendDist` 7px）→ 同一趋势，不再切（录像里顺着斜边削第二层皮）。
   - **方向变了就不限制**：夹角大于 `trendAngle`（含反向、转弯、另起一条缝）→ 新刀，必须切。连续滑、换方向不能漏刀。
   - 抬手后 `lastSlash` 清空。切完仍要 `awaitBlank` 再进下一刀。
5. **抬手停在板内不切**。`pointercancel` 收刀，已切的保留。
6. 切开失败也已消耗 `progress`（不恢复跟踪）。

同段微段从外贯穿且两边不同、弦够深 → 本段立刻提交。

## 帮助（可以不帮）

### 入点 A（`START`）

只看 **按下点**，不看拖近哪条边。

| | 慢（&lt; `fastSpeed` 160） | 快 |
|--|--|--|
| 按下离最近边 | ≤ `slowDist` 10px | ≤ `fastDist` 36px |
| 做法 | 吸到按下点最近边；须比第二近至少远 `slowClear` 8px | 沿刀向回投；若打到对边则仍吸近边 |
| 转角（两条边都近） | 先划 `cornerMove` 10px，回投只许落在这两条近边上 | 同左 |
| 板心按下 | 不吸、不回投、本划不帮 | 同左 |

### 出点（快划补切）

慢划：必须真出边。  
快划同时满足才补：中位速度 ≥ `fastSpeed`；段方向 vs 青线 ≤ `FLASH.aimAngle` 10°；青线全长 ≥ `assistMinChord` 80px；行程 ≥ 0.85；进出两边不同；切缝够深。  
补切：`c0` = 锁住的 A，`c1` = 青线另一头。

切开后 `assistHold`：刀尖离剩余木轮廓 &gt; `assistLeave` 12px 才允许**下一刀补切**。真出边贯穿不受此挡。

## 反馈

绘制顺序（下→上）：**夹缝 → 刀光 → 手指划痕**。对缝调试彩线最上。

### 夹缝

- 从入边起到刀尖，不出板。入口宽（随缝长加到 `crackWMax` 6.6）、指尖细（`crackW` 1.2）。
- 进板即可画，不必等刀光锁定。切完刀还在 keep 上仍可跟手。

### 刀光（`FLASH`）

- 纺锤：两头细、中间宽。方向跟夹缝。入端从板外 `overshootBack` 起笔，出端按 `spanMin` + 甩出拉长。
- 动画 0.3s：从入边变长（起始已占全长 `growStart` 28%），短时宽、拉满时细，然后淡出。
- **提前闪**：已锁 + 对准 `aimSegs` 段 + 滑速 ≥ `minSpeed` 180 + 行程 ≥ 0.85。每刀最多一次。
- **提交闪**：本刀还没提前闪过，切开必须闪。屏幕上同时只播一条。
- 慢划不提前闪；划穿仍闪。

### 划痕（`TRAIL`）

手指折线。`predictAlpha` 0：系统预测点不画，避免空白处像刀光。

### 对缝调试

`INTENT.debug = 1`：青 = 青线，粉 = 锁定弦，黄 = 真切开。

## 状态机

`stepSlashIntent` 每微段输出 `IntentFrame`。`slashWorld` 只编排：`setCrack` → 若 `commit` 则切网格（成功才 `awaitBlank` / `freezeFlash` / `commitFlash`）→ 否则 `earlyFlash`。

解锁 `INTENT.unlockAngle` 只灭刀光锁，不丢本刀 `progress`。

## 参数表

### `START`

| 键 | 默认 | 作用 |
|----|------|------|
| slowDist / slowClear | 10 / 8 | 慢吸边距离、须独近 |
| fastDist / fastSpeed | 36 / 160 | 快档距离、快档滑速 |
| cornerMove | 10 | 转角先挪这么远再选边 |
| assistMinChord | 80 | 短于此时不补切 |
| speedWindow | 4 | 中位速度段数 |
| assistLeave | 12 | 切后离板这么远才再补切 |
| cornerMinChord | 0.22 | 邻边切缝占短边比例 |
| trendAngle | 5 | 大于此夹角 = 方向已变，不限制 |
| trendDist | 7 | 同向且贴缝才挡续切 |

### `INTENT`

| 键 | 默认 | 作用 |
|----|------|------|
| lockSegs / minFromEnter | 2 / 8 | 锁定段数、离入点 |
| lockAngle / unlockAngle | 18 / 34 | 锁定角 / 解锁角（度） |
| minSpeed | 30 | 未锁时低于此不锁 |
| debug | 0 | 对缝彩线 |

### `FLASH`（节选）

| 键 | 默认 | 作用 |
|----|------|------|
| minSpeed / aimAngle / aimSegs | 180 / 10 / 5 | 提前闪 |
| minTravelRatio | 0.85 | 提前闪与补切共用行程 |
| life / grow / growStart | 0.3 / 0.55 / 0.28 | 时长与变长 |
| coreW / coreWMin | 15 / 1.65 | 短时最宽 / 满时最细（半宽） |
| spanMin / overshootBack / overshoot | 300 / 72 / 42 | 长度与两端探出 |

### `TRAIL`

`show` 1、`life` 0.24、`headW` 5、`tailW` 0、`predictAlpha` 0。

## 模块

| 文件 | 职责 |
|------|------|
| `slashIntent.ts` | 政策：入点、提交、补切、青线、夹缝几何、提前闪谓词 |
| `slashWorld.ts` | 切网格、物理、overlay |
| `slashDebug.ts` | 夹缝 / 刀光动画 / 划痕 |
| `cutTarget.ts` | 兼容 re-export，勿再写政策 |

## 刻意不做

推测性切开再撤回；板心拖出当贯穿；用单段速度当快划；第二刀关掉真出边；震动（玩法未接）；ML 分类。
