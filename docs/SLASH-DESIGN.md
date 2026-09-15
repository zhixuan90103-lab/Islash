# 划切玩法规范

参数真源：`src/game/design.ts`。手感只改那里（或调试面板，写的是同一份对象）。不要在其它模块再写魔法数。

调研结论（iSlash Masters、切开几何）见 [SLASH-RESEARCH.md](./SLASH-RESEARCH.md)。本文件是**当前工程已落地的规则**；调研里「不做物理」已被本原型覆盖。

## 一句话

滑动 = 刀；盒子 = 木头。划穿后 1 变 2：大块留下静止，小块被踢飞。无地面、无关卡、无分数。

## 规则

1. **一刀成立**：滑出多边形时，进出落在**两条不同的轮廓边上**就切（真实凸包边，不是包围盒）。同一条边蹭进蹭出不算。不再等划很长。
2. **下一刀**：切完必须先回到空白（刀尖不在任何剩余木上），再从空白进入并贯穿，才算第二刀。同一滑动可以多刀，但不能贴在板上连切。
3. **命中**：微段与轮廓求交；刀面用该刀的入点→出点。抬手停在板内不切；`pointercancel` 收刀，已切的保留。
4. **切开**：世界空间三角剖分 + 补截面。删旧 mesh，加两块。体积大的留下（static），小的变 dynamic。
5. **刀面**：`Cross(刀向, 相机朝向)`，退化时 `Cross(刀向, camera.up)`。
6. **只踢被砍下的块**。留下的块不位移、不给冲量。
7. **刚体**绕体积质心。质量/惯量 = Rapier 密度 × 碰撞体。无地面。
8. **不伪造**「重的一侧向下」的额外力矩。
9. **触控**走 `clientToDesign`；letterbox 外忽略。调试面板 `stopPropagation`，不抢刀。

## 木头尺寸

- `WOOD_SHAPE`：设计形体，默认 **0.7 × 2 × 0.15**（板，不是正方体）。
- `WOOD.width/height/depth`：乘数，默认全 **1** = 保持 `WOOD_SHAPE`。
- `WOOD.lift`：相对画面中心的 Y。
- 实际边长：`woodSize()` = SHAPE × 乘数。改乘数后调试面板会重建盒子。

## 砍飞（冲量）

方向（归一后按权重混合）：

| 分量 | 参数 | 含义 |
|------|------|------|
| 刀向 A→B | `wBlade`，Y 再乘 `bladeYScale` | 主方向；上下砍差异缩小 |
| 切开法线（小块相对大块） | `wNormal` | 两块分开 |
| 朝相机 | `wCam`，Y 再乘 `camYScale` | 避免贴屏直立 |
| 世界上挑 | `wLift` | 额外向上 |
| 升力夹紧 | `maxUpFraction` | 冲量 Y 不超过 `J * maxUpFraction` |

力度（质量归一，避免小块飞出屏幕、大块原地不动）：

```
speedScale = clamp(max(滑速, minSliceSpeed) / speedRef, 0, 1)
targetSpeed = impulseBase * kickToSpeed * speedScale
J = mass * targetSpeed
作用点 = lerp(质心, 切点, 0.2)
之后 |v| ≤ maxSpeed，|ω| ≤ maxSpin
```

`impulseBase` 是目标速度的系数，**不是**直接塞给 Rapier 的牛顿秒。Rapier：`Δv = impulse / mass`。

## 参数表（`PHYS`）

| 键 | 默认 | 作用 |
|----|------|------|
| gravityY | -8 | 世界重力 Y |
| density | 2.6 | 碰撞体密度 → 质量 |
| friction / restitution | 0.85 / 0.04 | 摩擦 / 弹性（无地面时几乎用不上） |
| linearDamping / angularDamping | 0.7 / 0.55 | 线/角阻尼 |
| minSliceSpeed | 80 | 低于此按此计力度（px/s） |
| speedRef | 500 | 滑速达到此值力度满 |
| impulseBase | 0.75 | 目标速度系数 |
| kickToSpeed | 4 | 与上一项相乘得 Δv（m/s） |
| maxSpeed / maxSpin | 4 / 6 | 踢完后线速度/角速度上限 |
| wBlade / wNormal / wCam / wLift | 0.2 / 0.16 / 0.5 / 0.2 | 方向权重 |
| bladeYScale | 0.4 | 刀向的 Y 缩放 |
| maxUpFraction | 0.7 | 冲量向上分量上限 |
| camYScale | 0.25 | 朝屏幕向量的 Y 缩放 |

`SLASH`：`armDist` 出刃采样、`interpGap` 插值间隙、`minChord` 最短弦、`hullChordRatio` 轮廓弦比例。

`VIEW`：fov / cameraZ / 背景 / 木头色。相机在 `(0,0,cameraZ)` 看原点。

## 模块

| 文件 | 职责 |
|------|------|
| `design.ts` | 全部可调参数 |
| `slashInput.ts` | 指针折线、出刃、滑速 |
| `slashHit.ts` | 轮廓、射线、点在凸包 |
| `cutTarget.ts` | 这一刀砍谁、哪一段弦、何时落刀 |
| `slashCut.ts` | 世界坐标剖分网格 + 补截面 |
| `bladeForce.ts` | 冲量合成、质量归一、夹速度 |
| `slashPhysics.ts` | Rapier 世界、密度、无地面 |
| `wood.ts` | 按 `woodSize()` 生成/重置 |
| `slashWorld.ts` | 会话编排 |
| `slashDebug.ts` | 刀痕 |
| `slashDebugPanel.ts` | `#ui-root` 调参（默认打开，向上展开） |
| `index.ts` | `mountSlashWorld` |

## 调试面板

挂在 `#ui-root`。点控件不触发划切。长宽高输入的是 **WOOD 乘数**，旁边显示 `WOOD_SHAPE × 乘数` 的实际世界尺寸。

## iOS 包

| 项 | 值 |
|----|-----|
| appId | `com.wangzhixuan.islash.cut` |
| appName | Islash Cut |
| 命令 | `npm run ios`（build + sync + 开 Xcode） |

真机选 Device，不要 Simulator（要 WebGPU）。改 Swift 插件才需要 `ios:bootstrap`。日常网页改动 `npm run ios` 或 `cap:sync` 即可。

## 刻意不做

关卡、胜负、分数、连击、主题皮、其它手势族、Android、WebGL 回退、伪造重侧下垂力矩。
