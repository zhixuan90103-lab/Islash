# 切开打击感规范

参数真源：`src/game/design.ts`（`SHAKE` / `FX` / `TRAIL` / `PHYS`）。  
编排：`src/game/slashWorld.ts`。震屏：`src/game/screenShake.ts`。碎屑/闪：`src/game/slashDebug.ts` overlay。  
玩法总则：[SLASH-DESIGN.md](./SLASH-DESIGN.md)。划痕调研：[SLASH-TRAIL.md](./SLASH-TRAIL.md)。

本文是**当前已落地规则**。音效仍未接（[AUDIO.md](./AUDIO.md)）。马达触觉见下文「刀的触觉」；接线仍走 [HAPTICS.md](./HAPTICS.md)。

## 原则

1. **视觉打击感只在网格切开成功时**（顿帧、碎屑、闪、踢屏、解冻加踢）。划空、夹缝、提前刀光不顿、不踢屏。马达：锁 A 轻击 + 弱持续；切开成功才打结束重击。
2. **力度共用 `hit`**：滑速 × 掉块大小，有保底、有上限。连砍可叠，但封顶。
3. **顿帧只冻这一刀新切开的块**。已飞出的块继续物理（卡普空 hitstop：只停当事双方）。
4. **震屏只改渲染相机**。玩法、触控、切缝投影用 rest 相机（`applyView` 前、`restoreView` 后）。
5. **反馈短暂，必须回静止。** 不冻 overlay、不冻输入。

## `hit`

```
speedK = clamp(max(滑速, minSliceSpeed) / speedRef, 0, 1)   // 同 bladeSpeedScale
sizeK  = min(1, 2 * dropVol / (dropVol + keepVol))          // 对半切开 = 1
hit    = clamp(speedK * sizeK, SHAKE.floor, 1)
```

慢且小 → 接近 `floor`（0.08）。快且接近对半 → 1。

## 刀的触觉（Taptic，不是震屏）

参数：`HAPTIC`（`src/game/design.ts`）。编排：`src/game/slashHaptics.ts`。

```
锁 A（progress.c0 / 真入边）
  → Transient 轻（enterI / enterS）
  → Continuous 弱（holdI / holdS），attack 渐起，最长 maxHold
切开成功
  → 停持续（原生约 50ms 淡出）
  → Transient 更强更锐，强度随 bladeSpeedScale；完成切割再乘 finishMul
失败 / 抬手 / 走廊余势 / 同边蹭
  → 只停持续，不打结束击
从未锁 A
  → 全程不震
```

## 时间轴（一刀）

```
切开成功
  → 碎屑（overlay，顿帧期间也飞）
  → 重砍才闪（hit ≥ flashAt）
  → 新 keep/drop 沿法线挤压，drop 重力=0、速度清零（顿 freezeMin…freezeMax，按 hit 插值）
  → 其它刚体照常 step
解冻
  → 松开挤压
  → 冲量 × FX.burst 踢飞 drop
  → 震屏 kick（沿刀向；相机反向移，画面顺刀向）
```

顿帧时长：`lerp(freezeMin, freezeMax, hit)`，约 2–6 帧（0.032–0.1s）。连砍各刀自己的计时，不把旧飞块重新冻住。

## 震屏（`SHAKE`）

包络：**短直线出击**（ease-out，`attack` 10ms）→ **柔和收回**（ease-in cubic，`settle` 0.22s）。出击不加噪声。

| 键 | 默认 | 作用 |
|----|------|------|
| show | 1 | 0 = 关 |
| kick | 0.01 | 刀向踢峰值（世界单位 × hit） |
| attack / settle | 0.01 / 0.22 | 出击 / 收回秒 |
| amp / freq / roll | 0.003 / 6 / 0.02 | 收回阶段碎振 |
| trauma / decay | 0.22 / 8 | 连砍叠创伤，振幅 trauma² |
| floor | 0.08 | hit 保底 |
| freezeMin / freezeMax | 0.032 / 0.1 | 顿帧秒 |

Kick 方向 = 切开 `bladeDir`（入点→出点）。`camera.position` 反向加，画面顺着滑的方向踹。合位移有上限。

**不要**：每帧 random 偏移；晃 `#stage`；`timeScale=0` 冻全世界；滑动全程 rumble（已回滚）。

## 切开特效（`FX`）

| 键 | 默认 | 作用 |
|----|------|------|
| chips / chipCount | 1 / 16 | 切缝木屑开关与基准数量（再乘 hit） |
| chipLife / chipSpeed | 0.78 / 220 | 寿命秒、设计 px/s |
| squeeze | 0.035 | 顿帧两块沿法线挤近（世界单位 × hit） |
| flashAt / flashLife | 0.42 / 0.05 | 低于阈值不闪；白+轻色差，很淡 |
| burst | 1.28 | 解冻冲量倍率 |

碎屑大小：多数小点，约三成略大。闪是 overlay `screen` 合成，不是后处理 pass。

## 划痕（`TRAIL`，表现层）

判定折线仍走 `INTERP_GAP`；**拖尾只记真实触点**，绘制向心 Catmull-Rom。最长像素 + 停手收回；收回时宽度随剩余长度一起收窄。

| 键 | 默认 | 作用 |
|----|------|------|
| maxLen | 180 | 沿路径最长（设计 px） |
| life | 0.3 | 满长收到指尖的秒数 |
| still | 0.03 | 判定停下后再等才开始收 |
| stopSpeed | 24 | 低于此 px/s 视为停手 |
| minDist / smooth / subdiv | 1.5 / 0.02 / 6 | 间距、刀尖低通、曲线细分 |
| headW / tailW / tipLen | 6.5 / 0 / 10 | 刀尖宽、尾宽、三角探出 |

细则与调研对比：[SLASH-TRAIL.md](./SLASH-TRAIL.md)。意图叠层：[SLASH-INTENT.md](./SLASH-INTENT.md)。

## 最后一刀（`finish`）

较大块体积 `< originVolume * CUT.finishRemain` 时触发。时间轴：

1. **出刀光即慢放**：终刀大刀光一出，物理 `×0.12`。顿帧期间两块仍钉住。镜头不推、不平移。  
2. **完全切开瞬间恢复**：解冻飞出的那一帧慢放关掉，块以 1× 飞开。

| 键 | 默认 | 作用 |
|----|------|------|
| freeze / scale | 0.1 / 0.12 | 顿=慢放窗口；物理倍率 |
| kickMul / burst | 2.4 / 1.45 | 踢屏与冲量倍率 |
| bladeScale / bladeLife / flashPeak | 2.4 / 0.5 / 0.11 | 刀光、寿命、闪白 |

## 模块

| 文件 | 职责 |
|------|------|
| `design.ts` | `SHAKE` `FX` `TRAIL` |
| `screenShake.ts` | hit 公式、kick 包络、render 偏移 |
| `slashWorld.ts` | 每刀独立顿帧、挤压、解冻冲量+kick |
| `slashDebug.ts` | 碎屑、闪、划痕 overlay |
| `main.ts` | `slash.step` → `applyView` → render → `restoreView` |
