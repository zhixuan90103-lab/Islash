# 划切玩法规范

参数真源：`src/game/design.ts`。手感只改那里（或调试面板，写的是同一份对象）。不要在其它模块再写魔法数。

调研：[SLASH-RESEARCH.md](./SLASH-RESEARCH.md)（玩法参考）、[SLASH-TECH.md](./SLASH-TECH.md)（连续切输入）。  
本文是**当前工程已落地的规则**。调研里的「Box 三角剖分 / 不做物理」已被覆盖。

## 一句话

滑动 = 刀；板 = 木头。划穿后 1 变 2：大块留下静止，小块被踢飞。无地面、无关卡、无分数。

## 规则

1. **一刀成立**：滑出多边形时，进出落在**两条不同的轮廓边上**就切（真实凸包边，不是包围盒）。同一条边蹭进蹭出不算。
2. **下一刀**：切完必须先回到空白（刀尖不在任何剩余木上），再从空白进入并贯穿。同一滑动可以多刀，但不能贴在板上连切。
3. **命中**：微段与轮廓求交；刀线用该刀的入点→出点。抬手停在板内不切；`pointercancel` 收刀，已切的保留。
4. **切开**：用刀线切开 **2D 轮廓**（`userData.profile`），每块按同一配方重新挤出。删旧 mesh，加两块。面积×厚度大的留下（static），小的变 dynamic。
5. **刀向**：入点→出点（设计坐标投到板面 XY）。冲量用法线 `Cross(刀向, 相机朝向)`，退化时 `camera.up`。
6. **只踢被砍下的块**。留下的块不位移、不给冲量、不做体积质心平移。
7. **飞出块**绕体积质心。质量/惯量 = Rapier 密度 × 碰撞体。无地面。
8. **不伪造**「重的一侧向下」的额外力矩。
9. **触控**走 `clientToDesign`；letterbox 外忽略。调试面板 `stopPropagation`，不抢刀。

## 几何（对齐 iSlash 切边）

真源只有两样：**板面 XY 凸多边形** `userData.profile` + **厚度** `userData.depth`。  
网格每次都从轮廓重新捏，不拿带倒角的 3D 再切。

要的观感：正面略小一圈，对着镜头能看见侧棱；切完后**没切到的边不变**，**新切边和外轮廓同一圈窄棱**。

### 一块木头怎么捏

1. 轮廓沿 Z **竖直挤出**（侧面不斜）。
2. 只在**朝相机那一圈**做等宽倒角：正面平行内收 `frontInset`，Z 向走同一宽度 → 斜角约 45°。
3. 背面 = 完整轮廓；正面 = 内收后的轮廓；中间一圈窄棱。

函数名 `createFrustumGeometry` 是历史名，**不是锥台**。整段厚度收成锥子会让切口变成「近窄远宽」的梯形，朝镜头摊开。

### 一刀怎么切

1. 刀线投到板面 XY，`splitConvexPolygon` 把 `profile` 切成两块凸多边形。
2. 删旧 mesh。两块各自再跑同一套挤出 + 倒角。
3. 面积 × 厚度大的留下（static），小的飞出（dynamic）。

### 倒角算法（`wood.ts`）

| 项 | 规则 |
|----|------|
| 内收 | 凸多边形平行偏移：边内移后邻边求交。交点必须对准**同一个原顶点**，再和背面拉链 |
| 尖角 | **不截 miter**。截断会让倒角带扭面、穿正面（矩形看着好、一切锐角就坏） |
| 太瘦 | 该块放不下 `frontInset` 时，二分缩小这一块的 inset；大块仍用原宽度 |
| 放不下 | inset 接近 0 则只竖挤、不做倒角，不要翻面 |
| 法线 | 每个三角形自己的面法线，不焊接；材质 `flatShading` |
| 过短边 | `cleanConvex` 丢掉过短边和共线点 |

### 禁止

- 把整板收成锥台 / 按刀向加宽侧面
- 对 3D 网格做平面 CSG、ConvexObjectBreaker、二次内收
- 用切完的倒角网格当下一切的真源
- 切开后改 `DoubleSide` 来遮破面

### 怎么算对

- 未切：四周一圈窄棱，竖侧面在透视下能看见一条。
- 横切 / 斜切 / V 口：新边和外边同一圈棱，切口不朝镜头摊开。
- 飞出块转动时：竖的厚度面 + 正面一圈倒角，不是扭曲三角片。
- 细尖碎片：斜棱可以变窄或取消，但不能穿面。

## 木头尺寸

- `WOOD_SHAPE`：设计形体 **0.7 × 2 × 0.15**（板，不是正方体）。
- `WOOD_SHAPE.frontInset`：正面倒角宽度，默认 **0.028**（XY 与 Z 相同）。某块太瘦时只缩小**该块** inset。
- `WOOD.width/height/depth`：乘数，默认全 **1**。
- `WOOD.lift`：相对画面中心的 Y。
- 实际边长：`woodSize()` = SHAPE × 乘数。改乘数后调试面板会重建板。

## 外观（`VIEW`）

水色背景 + 暖橙木，方便看倒角。相机 `(0, 0, cameraZ)` 看原点。

| 键 | 默认 | 作用 |
|----|------|------|
| fov / cameraZ | 45 / 6.2 | 透视 |
| bg / bgCenter / bgEdge | `#2eb5e0` / `#6ad4f0` / `#0d6e9c` | 径向水色；`backdrop.ts` 再画同心圆 |
| woodColor | `#d4893a` | 木板 |
| hemiSky / hemiGround / hemiIntensity | `#fff6e8` / `#1a6d8c` / 0.9 | 半球光 |
| keyColor / keyIntensity / keyPos | `#fff4e6` / 1.45 / `(1.6, 7.2, 5.4)` | 主光偏上、略靠镜头 |

CSS `--stage-bg` / `--shell-bg` 与水色对齐，letterbox 不要再是暗海军蓝。

## 砍飞（冲量）

方向（归一后按权重混合）：

| 分量 | 参数 | 含义 |
|------|------|------|
| 刀向 A→B | `wBlade`，Y 再乘 `bladeYScale` | 主方向 |
| 切开法线（小块相对大块） | `wNormal` | 两块分开 |
| 朝相机 | `wCam`，Y 再乘 `camYScale` | 避免贴屏直立 |
| 世界上挑 | `wLift` | 额外向上 |
| 升力夹紧 | `maxUpFraction` | 冲量 Y 不超过 `J * maxUpFraction` |

力度（质量归一）：

```
speedScale = clamp(max(滑速, minSliceSpeed) / speedRef, 0, 1)
targetSpeed = impulseBase * kickToSpeed * speedScale
J = mass * targetSpeed
作用点 = lerp(质心, 切点, 0.2)
之后 |v| ≤ maxSpeed，|ω| ≤ maxSpin
```

`impulseBase` 是目标速度系数，不是直接塞给 Rapier 的牛顿秒。`Δv = impulse / mass`。

## 参数表（`PHYS`）

| 键 | 默认 | 作用 |
|----|------|------|
| gravityY | -8 | 世界重力 Y |
| density | 2.6 | 碰撞体密度 → 质量 |
| friction / restitution | 0.85 / 0.04 | 摩擦 / 弹性 |
| linearDamping / angularDamping | 0.7 / 0.55 | 线/角阻尼 |
| minSliceSpeed | 80 | 低于此按此计力度（px/s） |
| speedRef | 250 | 滑速达到此值力度满 |
| impulseBase | 0.75 | 目标速度系数 |
| kickToSpeed | 4 | 与上一项相乘得 Δv（m/s） |
| maxSpeed / maxSpin | 4 / 6 | 踢完后线速度/角速度上限 |
| wBlade / wNormal / wCam / wLift | 0.2 / 0.35 / 0.5 / 0.4 | 方向权重 |
| bladeYScale | 0.4 | 刀向的 Y 缩放 |
| maxUpFraction | 0.7 | 冲量向上分量上限 |
| camYScale | 0.25 | 朝屏幕向量的 Y 缩放 |

`SLASH`：`armDist` 8、`interpGap` 5、`minChord` 8、`hullChordRatio` 0.08。

`TRAIL`：`life` 0.24、`minDist` 0.5、`headW` 5、`tailW` 0。

## 模块

| 文件 | 职责 |
|------|------|
| `design.ts` | 全部可调参数 |
| `backdrop.ts` | 水色径向背景贴 `scene.background` |
| `slashInput.ts` | 指针折线、出刃、滑速 |
| `slashHit.ts` | 轮廓、射线、点在凸包 |
| `cutTarget.ts` | 这一刀砍谁、哪一段弦、何时落刀 |
| `slashCut.ts` | 板面 XY 上切轮廓，重建两块网格 |
| `bladeForce.ts` | 冲量合成、质量归一、夹速度；体积用轮廓面积 |
| `slashPhysics.ts` | Rapier；仅飞出块做体积质心；留下块 fixed |
| `wood.ts` | 轮廓、倒角挤出、生成/重置 |
| `slashWorld.ts` | 会话编排 |
| `slashDebug.ts` | 刀痕 |
| `slashDebugPanel.ts` | `#ui-root` 调参 |
| `index.ts` | `mountSlashWorld` |

## 调试面板

挂在 `#ui-root`。点控件不触发划切。长宽高输入的是 **WOOD 乘数**，旁边显示 `WOOD_SHAPE × 乘数` 的实际世界尺寸。

## iOS 包

| 项 | 值 |
|----|-----|
| appId | `com.wangzhixuan.islash.cut` |
| appName | Islash Cut |
| 命令 | `npm run ios`（build + sync + 开 Xcode） |

真机选 Device，不要 Simulator（要 WebGPU）。改 Swift 插件才需要 `ios:bootstrap`。

## 刻意不做

关卡、胜负、分数、连击、主题皮、其它手势族、Android、WebGL 回退、伪造重侧下垂力矩、参考作的 HUD/红鼓、整板锥台、3D CSG 切倒角网格。
