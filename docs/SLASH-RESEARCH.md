# 划切操作调研结论

本周主题：划切。范围：轨迹跟手、划过即生效、可取消误划。不做关卡、胜负、分数、物理、其他手势族。

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
- 时机：`pointermove` 穿过即切，不是松手提交。
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

## 5. 有效来源

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
