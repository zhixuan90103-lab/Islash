# 划切操作调研结论

本周主题：划切。调研范围曾写「不做物理」；**工程已加基础 Rapier**，落地规则以 [SLASH-DESIGN.md](./SLASH-DESIGN.md) 为准。仍不做关卡、胜负、分数、其他手势族。

工程：portrait-webgpu-base（Islash），设计空间 390×844，WebGPU，触点走 `clientToDesign`。

---

## 1. iSlash Masters 核心玩法

系列：iSlash → iSlash Heroes → iSlash Masters。规则同一套。勿与 iSlash DOJO（下落物护气球）混淆。商店名 Slash Masters 3D 是另一游戏。

核心：
- 板上划穿。没星的那块掉，有星的留下。
- 剩余面积到红结过关。刀碰到星则重来。
- 两块都有星则这刀无效。
- 无时限。铁边不能切。

几何含义：一刀后旧板消失，变成两块；星所在侧留下。不是在原模型上刮缝。

---

## 2. 切开原理（滑动完成后）

不是改同一个模型。按刀面把点分成正侧/负侧，各包成新网格，删旧模型，场景从 1 个变成 2 个。

- 刀面：法线 + 面上一点。点到面的有符号距离 >0 归 A，<0 归 B。
- 跨面的棱在交点断开。两侧点集各自 Convex 凸壳 = 新模型。交点圈形成截面。
- 本周两半都保留，沿法线撑开露缝。一侧点太少则当没切开。
- 只切实心凸块（方块）。凹/空心/开面不做。

命中分层（自洽）：
- 2D：刀带 vs 物体屏幕投影弦长，过阈才算划过。
- 3D：过阈后才建平面、`cutByPlane`。
- 不要用「当前点 Raycaster 打中正面」当穿过。

表现：删旧 mesh，加两块，±法线微移。Clipping / TSL mask 只藏几何，不当玩法切开。

---

## 3. 操作结论

- 输入：Pointer Events，不是系统 Swipe/Pan。
- CSS：`touch-action: none`（本仓已有）。
- 时机：见 **§6 连续滑动切割**。参考作是「指还按着、刀还在动就切」，不是松手提交。
- 取消：未切开的 up / pointercancel / lostpointercapture。
- 跟手：`setPointerCapture`；coalesced 或段插值。
- 单指：`isPrimary` + 同一 `pointerId`。
- 坐标：`clientToDesign` + `#stage.getBoundingClientRect()`。
  NDC：`x/390*2-1`，`-(y/844)*2+1`。禁止用 `window.innerWidth`。
- 关 OrbitControls；canvas 保持 `pointer-events: none`；听 `#stage`。
- 出界不取消、不判切。

---

## 4. 周五实施闸门

- 可切物：无缩放 BoxGeometry + `prepareBreakableObject(mass>0)`。
- 切：`ConvexObjectBreaker.cutByPlane`。返回不足 2 块则当没切开。
- 多物：只切弦长最大且过阈的一个。
- 不用 CSG、pinata（源码未读完）、Rapier。
- Debug：刀痕 + 投影框。

---

## 5. 连续滑动切割（本轮）

参考作把手指按住期间的轨迹当成**还活着的刀**，不是「一划 = 提交一次切」。

### 参考作怎么做

| 游戏 | 连续切长什么样 | 证据 |
|------|----------------|------|
| **Fruit Ninja** | 一指不抬，刀痕划过几颗就切几颗。三颗以上同一划算 combo。停住再动可能被记成另一刀。 | 百度百科计分：一划连切 3+ 才 combo；技巧写「弯刀若手法差会被记成多刀」。教程实现（Zigurous 一类）：按下生成刀体，松开销毁；碰撞 `OnTriggerEnter` **当场切**。 |
| **Cut the Rope** | 一划扫过多根绳子，经过的先断。官方：*cut several ropes at the same time by slicing across several at once*。成就 Quick/Master Finger = 一划断 3 / 5 根。 | 官方 PDF、TrueAchievements、Kotaku。 |
| **iSlash / Masters** | 「手指就是武器」。板上划穿即切；同一划若再穿过剩下的木/绳也会切（碰到星则整局重来，所以连续划更险）。官方不写「必须抬手才能下一刀」。 | Duello：*your finger is your weapon*；系列规则是划穿掉无星块。 |

共同点：

1. **刀 = 按下期间的刃**，不是整段折线在 `pointerup` 一次性结算。
2. **判切单元是「上一采样点 → 当前点」这一小段**（可加厚度），对场景里每个可切物做穿过检测。
3. **切完立刻换网格**。新块马上可切，同一划的后续段可以再切它们。
4. **已切过的那一块**本划不再切（水果切开就结束；绳子断了就没了）。
5. **抬手只收刀**，不负责「提交切开」。没划穿就当这刀空挥。

不是「一次按下只能切一次」。Fruit Ninja / Cut the Rope 的手感完全建立在一划多目标上。iSlash 是解谜，玩家常一划一刀，但输入模型仍是连续刃，不是松手提交。

### 常见实现（2D 刃，3D 切开）

```
pointerdown  → 开始一刀，刃活着
pointermove  → 段 S = prev→tip
               对每个可切物：S 是否划穿投影/碰撞体？
                 是 → 立刻 1 变 2，旧物出列表，新块进列表
                 同一帧可切多个（段够长时）
pointerup    → 刃消失，trail 淡出
```

3D 箱体：段 S 在屏幕上与投影轮廓求弦，或用相机射线扫过段；过阈再 `cutByPlane`。刀面用**这一段**的两端 + 相机，不要用整刀起点。

### 和本仓库的差距

当前实现（`slashWorld.tryCut` + `cutTarget.resolveCutTarget`）：

| 现状 | 后果 |
|------|------|
| `stroke.cutDone`，一刀只切一次 | 同一划不能再切剩余块 |
| 落刀：刀尖离开模型 **或** `pointerup` | 还按在木头上不会切；不能边划边连切 |
| 弦 = 整刀起点→刀尖与轮廓交线 | 弯刀/连切用的不是「当前刃段」 |

要对齐参考作，需要改成：

- 去掉「一划一次」的 `cutDone`（改为「本划已切过的 mesh id」）。
- `pointermove` 用 **prev→tip** 判穿，穿过立刻切，不等离开、不等抬手。
- 切开后新块立刻进 `cuttables`，后续段可再切。
- 刀向/冲量用这一段的方向和这段滑速。

技术映射与反查补漏：[SLASH-TECH.md](./SLASH-TECH.md)。第三轮：EzySlice/Valem 刃段 Linecast + `Cross(刃, 第二向量)`；手指第二向量用相机朝向；钉住的木用累计划穿。

本周范围仍可：无关卡、无分数。连续切属于操作本身，不是连击系统。

---

## 6. 有效来源

### 连续滑动

- https://baike.baidu.com/item/Fruit%20Ninja （一划多果 combo；弯刀可能被记成多刀）
- https://www.youtube.com/watch?v=QPBBR0O7W0E （刃随鼠标，移动中判定切开）
- https://dy822md8ge77v.cloudfront.net/root/live/pdf/game_guides/cut_the_rope/CutTheRope_ENG.pdf （一划多绳）
- https://www.trueachievements.com/game/Cut-the-Rope-Windows-8/walkthrough （Quick Finger：一划断 3 绳）
- https://www.duello.com/games/islash （手指即武器）

### 玩法

- https://www.4gamer.net/games/190/G019089/20121031002/
- https://www.techbang.com/posts/5133-iphone-fun-game-islash-test-your-reaction
- https://www.newton.com.tw/wiki/iSlash/2034595
- https://appadvice.com/app/islash-masters/949498190
- https://apps.apple.com/us/app/islash-masters/id949498190
- https://www.iofreeonline.com/IOS/game/iSlash.html
- https://www.levelwinner.com/islash-heroes-tips-tricks-cheats-to-become-the-ultimate-ninja/
- https://www.duello.com/games/islash
- https://play.google.com/store/apps/details?id=com.duellogames.iSlash2

### 操作官方

- https://developer.apple.com/design/human-interface-guidelines/game-controls
- https://developer.apple.com/documentation/uikit/handling-pan-gestures
- https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Using_Pointer_Events
- https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
- https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture
- https://developer.mozilla.org/en-US/docs/Web/API/Element/lostpointercapture_event
- https://developer.mozilla.org/en-US/docs/Web/API/Element/pointercancel_event
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action
- https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getCoalescedEvents
- https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/isPrimary

### 3D 切开

- https://threejs.org/docs/pages/ConvexObjectBreaker.html
- https://github.com/mrdoob/three.js/blob/master/examples/jsm/misc/ConvexObjectBreaker.js
- https://github.com/mrdoob/three.js/blob/dev/examples/physics_ammo_break.html
- https://threejs.org/docs/pages/Raycaster.html
- https://github.com/mrdoob/three.js/blob/master/src/core/Raycaster.js
- https://github.com/mrdoob/three.js/blob/master/src/math/Plane.js
- https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_clipping.html
- https://github.com/dgreenheck/three-pinata
- https://github.com/gkjohnson/three-bvh-csg
- https://github.com/gkjohnson/three-mesh-bvh

### 论坛

- https://discourse.threejs.org/t/how-to-slice-and-remove-a-mesh-from-boolean/73229
- https://discourse.threejs.org/t/clipping-planes-with-csg/56907
- https://discourse.threejs.org/t/how-to-use-polyline-to-slice-a-mesh-and-change-part-of-its-color/26556
- https://stackoverflow.com/questions/62157345/three-js-how-to-use-a-plane-to-cut-objects-in-2-parts

### 对照（不当划过即切模型）

- https://github.com/yappeizhen/frootninja

### 本仓

- `src/adapt/design.ts`
- `src/create-renderer.ts`
- `src/style.css`
- `src/main.ts`（Orbit 须关）

### 未当作依据

Slash Masters 3D、iSlash DOJO、pinata lib 实现源码（未读到）、Capacitor iOS 配置页（无触点专章）。
