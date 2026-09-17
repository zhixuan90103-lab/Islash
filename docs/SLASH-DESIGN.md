# 划切玩法规范

参数真源：`src/game/design.ts`。手感只改那里（或调试面板，写的是同一份对象）。不要在其它模块再写魔法数。

调研：[SLASH-RESEARCH.md](./SLASH-RESEARCH.md)（玩法参考）、[SLASH-TECH.md](./SLASH-TECH.md)（连续切输入）。  
意图：[SLASH-INTENT.md](./SLASH-INTENT.md)（入点 / 补切 / 已消费直线 / 刀光 / 夹缝）。  
打击感：[SLASH-FEEL.md](./SLASH-FEEL.md)（顿帧、震屏、碎屑、划痕）。  
本文是**当前工程已落地的规则**。调研里的「Box 三角剖分 / 不做物理」已被覆盖。

## 一句话

滑动 = 刀；板 = 木头。划穿后 1 变 2：大块留下静止，小块被踢飞。较大块体积低于整板 `CUT.finishRemain`（默认 1/10）时为完成切割，两块都沿刀向飞出。图库三块循环进场。无地面、无关卡、无分数。

## 规则

1. **一刀成立**：进出落在**两条不同凸包边上**，且切缝够深（`minChord` / `hullChordRatio`）。同一条边蹭不算。终点帮助：对准青线且行程 ≥ T(速度) 时可补出点；最慢须 100% 真出边。
2. **下一刀**：同一按住可以多刀，但一刀是一条 A→B，不是一次按下。网格切开成功后该有向直线被本划消费；走廊内沿该方向的续滑（含真出边、对留下块再锁 A）不再出刀。横走出走廊或沿该线折返后可再切。细则见意图文。
3. **命中**：微段与轮廓求交；刀线用入点→出点。从板外进，或起点打分锁 A。**A 锁死到本刀切开或抬手**，弯刀不改入点。板心按下再拖出不记刀。抬手停在板内不切。出边微段跳过凸包时用锁死的 A→刀尖打穿出点。
4. **反馈**：夹缝（入边→刀尖）在下，刀光在中，手指划痕在上。刀光不等于提交。切开成功才顿帧/碎屑/踢屏，见 [SLASH-FEEL.md](./SLASH-FEEL.md)。
5. **切开**：用刀线切开 **2D 轮廓**（`userData.profile`），每块按同一配方重新挤出。删旧 mesh，加两块。面积×厚度大的留下（static），小的变 dynamic。子块继承整板 `originVolume`。
6. **刀向**：入点→出点（设计坐标投到板面 XY）。冲量用法线 `Cross(刀向, 相机朝向)`，退化时 `camera.up`。
7. **未完成时只踢被砍下的块**。留下的块不位移、不给冲量、不做体积质心平移。
7b. **完成切割**：切开后较大块体积 `< originVolume * CUT.finishRemain`（默认 0.1）。该刀两块都变 dynamic，各自按刀向 + 相对法线踢飞，不再留下 static。演出：先顿 → 慢放飞出 → 镜头/时间恢复，见 [SLASH-FEEL.md](./SLASH-FEEL.md)「最后一刀」。
7c. **进度**：相对能砍额度 `origin * (1 - finishRemain)`。未完成 `进度 = (origin - keep) / 额度`；完成切割钳到 100%。条挂 `#ui-root` 顶，无标题文字。飞出后再等 `CUT.nextDelay` 刷下一块，进度清零。
7d. **进场**：新板从画面上方滑入到中心（`CUT.enterDur`，ease-out）后停下。不持续下落、不出下边。
7e. **图库**（`BOARDS`，依次循环，连续不重复靠顺序）：长六边菱形（自有世界尺寸，不对齐面积）→ 圆 48 边（线度 `circleScale` 0.81）→ 正方形（线度 `squareScale` 0.8）。包进 `CUT.boardMaxW×boardMaxH`。
8. **飞出块**绕体积质心。质量/惯量 = Rapier 密度 × 碰撞体。无地面。
9. **不伪造**「重的一侧向下」的额外力矩。
10. **触控**走 `clientToDesign`；letterbox 外忽略。调试面板 `stopPropagation`，不抢刀。

## 几何（对齐 iSlash 切边）

真源只有两样：**板面 XY 凸多边形** `userData.profile` + **厚度** `userData.depth`。  
网格每次都从轮廓重新捏，不拿带倒角的 3D 再切。

要的观感：正面略小一圈，对着镜头能看见侧棱；切完后**没切到的边不变**，**新切边和外轮廓同一圈窄棱**。切面是直边挤出，保持平整。块是封闭实体。

### 一块木头怎么捏

1. 轮廓沿 Z **竖直挤出**（侧面不斜）。
2. 只在朝相机那一圈做倒角：边内移 `frontInset`，Z 向同一宽度 → 约 45°。
3. 背面 = 完整轮廓。正面 = 半平面内收后的简单凸多边形。

实现：`createWoodSolid`（`createFrustumGeometry` 是历史别名，**不是锥台**）。

### 一刀怎么切

1. 刀线投到板面 XY，`splitConvexPolygon` 得到两块凸多边形。
2. 删旧 mesh。两块各自再跑同一套挤出 + 倒角。
3. 面积 × 厚度大的留下（static），小的飞出（dynamic）。

### 倒角算法（`woodChamfer.planChamfer`）

倒角是边上的特征，不是「整块内收，失败就整圈降档」。

| 步骤 | 规则 |
|------|------|
| 轮廓 | `cleanConvex` 去重、过短边、共线点。切开后的真源。 |
| 内收 | 每条边沿内法线平移 `frontInset`，再用**其余偏移半平面裁这段**。内轮廓一定简单凸，不会自交。 |
| 锐角 | 宽 d 的两条倒角带在尖楔里会相交。该角 miter 落在别的半平面外 → **丢掉这个内顶点**，外轮廓短边收到内沿上。切边仍是原直边挤出。 |
| 封口 | 底、顶、每条竖直侧面、倒角带、尖角补面都要有。内沿两端几乎重合时**仍要补面**（收到一点），不能当成已经接好。 |
| 整块没棱 | 仅当 `inset ≥ 轮廓最小高`，或裁完剩下不足 3 条内边（比倒角还瘦的碎片）。 |
| 法线 | 每个三角形自己的面法线。材质 Lambert 漫反射（无镜面）。单面绘制。 |

文件：`woodProfile.ts`（轮廓/切开）、`woodChamfer.ts`（内收计划 + 挤出）、`wood.ts`（生成/重置）。

### 不要再走的弯路

这些都会在切开后露馅（整圈没棱、差面、插面、漏面）：

- 整板收成锥台 / 3D CSG / 对倒角网格再切
- 顶点 1:1 拉链 + 截 miter（锐角扭面）
- 整块二分缩小 `inset`（大块突然变平）
- 用「垂足是否在原轮廓内」关边（钝角误关，切面变平）
- 内沿两点接近就跳过补面（外轮廓短边封不上）

### 怎么算对

- 未切：四周一圈窄棱，竖侧面在透视下能看见一条。
- 横切 / 斜切 / V 口：新边和外边同一圈棱；切面平整，不朝镜头摊开。
- 飞出块转到背面、侧面、切面，都不应看到洞。
- 大块擦过顶点：外圈棱还在，不会整圈变平。
- 锐角：尖角收短，其它边宽度不变，倒角带不对穿。
- 细尖碎片：可以没有倒角，但不能穿面、不能漏面。

## 木头尺寸

- `WOOD_SHAPE`：设计形体 **0.7 × 2 × 0.075**（板，不是正方体）。
- `WOOD_SHAPE.frontInset`：正面倒角宽度，默认 **0.028**（XY 与 Z 相同）。锐角靠半平面裁掉内顶点，不另设 miter 上限。
- `WOOD.width/height/depth`：乘数，当前默认 **1.75 / 1.75 / 1**（面积目标约 **1.225 × 3.5**）。
- `WOOD.lift`：进场结束后的中心 Y。
- `WOOD.uvScale`：木纹世界 XY 投影，默认 **0.3**（整板落在一张纹内，避免 Repeat 接缝）。
- `WOOD.faceColor`：正面漫反射乘色，默认 `#fff3e4`。
- 实际边长：`woodSize()` = SHAPE × 乘数。改乘数后调试面板会重建板。

## 外观

相机 `(0, 0, cameraZ)` 看原点。背景是贴图板 + 投影层，不是程序水色。

### 背景与投影

| 项 | 位置 / 默认 | 说明 |
|----|-------------|------|
| 贴图 | `src/assets/bg-dojo.jpg` | 红色青海波；`MeshBasicMaterial` 不吃光 |
| 接影 | `ShadowMaterial`，`VIEW.bgZ` **-0.28** | 木板 `castShadow`，影子落在板后 |
| `VIEW.shadowOpacity` | 0.38 | 影子浓度 |
| `VIEW.bgEdge` | `#5c1814` | `scene.background` / letterbox |
| CSS | `--stage-bg` `#c44a3a`、`--shell-bg` `#4a1512` | 与红底对齐 |

### 木头材质（未上漆 = Lambert）

官方：`MeshLambertMaterial` 用于 untreated wood，无镜面。正面 / 倒角两套材质 + 同一张四方连续木纹 `src/assets/wood-grain.jpg`。UV 用世界 XY。倒角略深（`VIEW.woodChamfer` `#e8c49a`）只为看出厚度。板面看起来比 jpg 深，是因为漫反射 × 灯光 × NeutralToneMapping，不是贴图坏了。

### 灯光（`LIGHT`，调试面板「灯光」）

| 键 | 默认 | 作用 |
|----|------|------|
| keyIntensity / fillIntensity / hemiIntensity | 3.6 / 0 / 1.4 | 主光 / 补光 / 环境 |
| keyYaw / keyPitch / keyDist | -13° / 44° / 6.9 | 主光方位（yaw 0=镜头，pitch 90=正上） |
| VIEW.hemiSky / hemiGround | `#fff6ea` / `#8a5a40` | 半球颜色 |
| fov / cameraZ | 45 / 6.2 | 透视 |

实现：`lights.ts` `mountGameLights` / `applyGameLights`。

### HUD

`#ui-root` 只挂进度条（`cutProgressHud.ts`）和调试按钮。无标题、无状态文案。

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

`impulseBase` 是目标速度系数，不是直接塞给 Rapier 的牛顿秒。`Δv = impulse / mass`。解冻时再乘 `FX.burst`（见打击感文）。

## 参数表（`PHYS`）

| 键 | 默认 | 作用 |
|----|------|------|
| gravityY | -10.6 | 世界重力 Y |
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

`SLASH`：`armDist` 8、`interpGap` 5、`minChord` 8、`hullChordRatio` 0.08。提交时弦长必须够深。

入点 / 补切 / 已消费直线 / 刀光 / 夹缝 / 划痕参数见 [SLASH-INTENT.md](./SLASH-INTENT.md)（`START` `INTENT` `FLASH` `TRAIL`）。

顿帧 / 震屏 / 碎屑 / 闪 / 解冻加踢见 [SLASH-FEEL.md](./SLASH-FEEL.md)（`SHAKE` `FX`）。要点：只冻**这一刀新块**；相机 rest 做玩法，仅渲染前偏移。

## 模块

| 文件 | 职责 |
|------|------|
| `design.ts` | 全部可调参数 |
| `backdrop.ts` | 关卡背景贴图 + 接影板 |
| `lights.ts` | 主光 / 补光 / 半球；读 `LIGHT` |
| `cutProgressHud.ts` | `#ui-root` 顶进度条 |
| `slashInput.ts` | 指针折线、出刃、滑速；本划 `consumed[]` |
| `slashHit.ts` | 轮廓、射线、点在凸包 |
| `slashIntent.ts` | 意图：锁 A、补切、消费走廊、夹缝/青线、提前刀光 |
| `slashCut.ts` | 板面 XY 上切轮廓，重建两块网格 |
| `bladeForce.ts` | 冲量合成、质量归一、夹速度；体积用轮廓面积 |
| `slashPhysics.ts` | Rapier；仅飞出块做体积质心；留下块 fixed |
| `woodProfile.ts` | 2D 轮廓、切开、图库 |
| `woodChamfer.ts` | 半平面内收计划 + 封闭挤出网格 |
| `wood.ts` | 生成/重置、meshFromProfile |
| `slashWorld.ts` | 会话编排、每刀顿帧、解冻冲量 |
| `screenShake.ts` | 切开震屏 |
| `slashDebug.ts` | 夹缝、刀光、碎屑、闪 overlay |
| `slashTrail.ts` | 手指划痕（时间制） |
| `slashDebugPanel.ts` | `#ui-root` 调参 |
| `index.ts` | `mountSlashWorld` |

## 调试面板

挂在 `#ui-root`。**默认收起**，只留「调试参数」按钮。点控件不触发划切。长宽高输入的是 **WOOD 乘数**。灯光滑条改 `LIGHT` 并立刻 `applyGameLights`。

## iOS 包

| 项 | 值 |
|----|-----|
| appId | `com.wangzhixuan.islash.cut` |
| appName | Islash Cut |
| 命令 | `npm run ios`（build + sync + 开 Xcode） |

真机选 Device，不要 Simulator（要 WebGPU）。改 Swift 插件才需要 `ios:bootstrap`。

## 刻意不做

关卡胜负、分数、连击、其它手势族、Android、WebGL 回退、伪造重侧下垂力矩、参考作红鼓/忍者星、整板锥台、3D CSG 切倒角网格、整块缩小 inset 当倒角失败兜底、Standard/Phong 木头（会出镜面）。
