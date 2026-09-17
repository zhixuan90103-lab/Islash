# 连续滑动切割 — 技术检索

玩法结论：[SLASH-RESEARCH.md §5](./SLASH-RESEARCH.md)。  
**现行规则**：[SLASH-INTENT.md](./SLASH-INTENT.md)（落地真源）。多指接线核验见 **§14**。  
§1–13 是当时检索草稿，时态是「怎么想到连续切」；其中「必须改 / 尚未改代码」已大部分落地，不要当成待办。栈：Pointer Events + 设计坐标 + **2D 轮廓切开**（`slashCut.ts` / `woodProfile.ts` / `woodChamfer.ts`）+ Rapier。网格：[SLASH-DESIGN.md](./SLASH-DESIGN.md)「几何」。

> 检索时写过「keep 钉在原地，同一划必再碰到新网格，所以新块必须可切」。那是**换网格不要漏下一刀**的工程约束。政策上：同一划的尾巴（刀尖还在刚切开的块上，或仍顺着缝）**不再出刀**；离开这些块再进，或折返，才是新刀。不要把本节的 `bornThisSeg` / 新块可切读成「沿同一缝再切一次」。

## 1. 参考实现（已读源）

### 1.1 Zigurous Fruit Ninja（Unity，行业默认教程）

源码：https://github.com/zigurous/unity-fruit-ninja-tutorial `Assets/Scripts/Blade.cs`

```
StartSlice  : collider.on + trail.clear，刃跟指针
ContinueSlice:
  direction = newPos - oldPos          // 这一帧位移 = 刀向
  velocity  = |direction| / dt
  collider.enabled = velocity > minSliceVelocity   // 停住不算切
  transform.position = newPos
StopSlice   : collider.off              // 抬手只收刀
```

水果：`OnTriggerEnter` → 立刻换半果、给冲量、销毁整果。  
**同一划能切多颗**：刃一直开着，下一颗自己再进 trigger。没有「一划一次」锁。

冲量：教程用常量 `sliceForce` + 刀向；滑速只当门槛（停住关 collider）。本仓已用滑速缩放力度，可保留。

### 1.2 其它切片教程

- Hashnode / 同类：同样 `OnTriggerEnter`，不是 `pointerup` 结算。
- Unity 论坛：combo = 同一刃连续进多个 trigger；计时器是分数，不是输入。
- 「必须划穿才切」：记 enter 点与 exit 点，两点连线当刀；**exit 后才切**。那是剑刃穿模，不是 Fruit Ninja。本仓参考作是 **碰到即切**（水果/绳）或 **弦过阈即切**（iSlash 板）。板可以保留弦长阈值，但阈值应对 **当前段 vs 轮廓**，不要等整刀抬手。

### 1.3 Three.js 反复切

- `ConvexObjectBreaker` 文档：切开得到的子物体 **不必再** `prepareBreakableObject`，可立刻再 `cutByPlane`。  
  https://threejs.org/docs/#examples/en/misc/ConvexObjectBreaker
- 官方 `physics_ammo_break.html`：同一帧删旧体、加碎片刚体。
- three-pinata：`slice` / `sliceWorld` 返回新 mesh 数组。本仓对凸板用 **2D 轮廓切一刀再挤出**，输出两块新 BufferGeometry，语义仍是 1 变 2。

### 1.4 输入精度

W3C Pointer Events：`pointermove` 会合并采样。快划时只用合并后的点，轨迹会跳过细物体。  
`getCoalescedEvents()` 还原中间点。本仓 `slashInput.ts` **已经**在用，且 `INTERP_GAP` 插值。连续切必须吃 **段**，不能只吃最后一个点。最多 3 条独立划（`START.maxStrokes`），按 `pointerId` 分表；同一 mesh 同时只允许一把锁 A。

## 2. 对本仓的映射

Unity 用移动的 trigger 球扫过水果。WebGPU 没有等价的每帧物理 trigger 扫屏，用 **2D 段 vs 投影轮廓** 代替：

```
每一 pointermove（含 coalesced 子点、插值后）:
  seg = prev → tip           // 现码：插值后 points[i-1]→[i]，不是整刀起点
  快照 cuttables（切的时候列表会变）
  for mesh in snapshot:
    if mesh.id ∈ slicedThisStroke: skip   // 只跳过「这一划已经切掉的那块」
    hull = projectMeshHull(mesh)
    if clip(seg, hull) 过 minChord（或射线命中）:
      plane = 相机 + seg 两端世界点
      (keep, drop) = cutMeshBySlash(...)
      删旧 mesh/body
      加 keep（static）+ drop（dynamic + 冲量）
      slicedThisStroke.add(旧 id)         // 新块是新 id，可被后续段再切
```

抬手：`slicedThisStroke.clear()`，刃没了。不要再为「提交」切一次，除非最后一段还没处理（把 end 当最后一次 move）。

### 已有、可复用

| 现成 | 文件 |
|------|------|
| 折线 + 插值 + coalesced | `slashInput.ts` |
| `onMove(stroke, lastSeg)` | 上一采样 → 刀尖（插值后的微段） |
| 轮廓裁剪、射线 | `slashHit.ts` |
| 2D 轮廓切开 + 半平面内收倒角 | `slashCut.ts` / `woodProfile.ts` / `woodChamfer.ts` |
| 换网格 + Rapier | `slashWorld.replaceCut` / `slashPhysics` |

### 当时缺口（现已落地）

| 当时 | 现在 |
|------|------|
| `stroke.cutDone` 整划锁死 | `slicedIds` 本划已切掉的旧块 |
| 落刀：刀尖离开或 up | 意图提交（穿边 / 补切）立刻切 |
| 弦 = 整刀起点→刀尖 | `onMove` 微段 `lastSeg`；刀线仍是锁死的 A→出点 |
| `tryCut(..., 'end')` | 抬手不再结算；`pointercancel` 只收该划 |

## 3. 同一帧多目标 / 切完再切

1. **先拷贝 `cuttables` 数组**再循环，循环里 `replaceCut` 会改原数组。  
2. 一段同时穿过两块：按弦长或体积排序，先切大的也可以两块都切。Fruit Ninja 是物理 trigger 顺序，无排序。板子解谜更稳的是 **一段只切一块（弦最长）**，下一段再切新块，避免一帧把整板切碎。  
3. **新块同一段不再切**：刚切出的 keep/drop 的投影可能仍和 `seg` 相交。要：
   - 本帧切开的新 id 加入 `skipUntilNextSeg`，或
   - 切开后丢掉当前 seg 的剩余长度（Fruit Ninja 不切半果是因为半果换了 collider 且刃已在外侧）。  
   推荐：`slicedThisStroke` 只记被删的 id；新块可切，但 **同一 `lastSeg` 不再对本次 `replaceCut` 产生的 mesh 检测**（`bornThisSeg` 集合，段结束清空）。

## 4. 刀面与物理

- 刀面：`setFromCoplanarPoints(camera, world(seg.a), world(seg.b))`，与现逻辑一致，只是两端改成段而不是整刀。  
- 冲量方向：这一段的设计坐标差 → 世界刀向。滑速用 **段速度**（`|seg| / dt`）比整划平均更跟手。整划平均可留作下限。  
- Rapier：删旧 `RigidBody` + collider，新 convex hull，`recomputeMassPropertiesFromColliders` 后再 `applyImpulseAtPoint`。不要在 `world.step` 中间切；输入回调里切完，等下一帧 `step`。  
- 留下块保持 static，后续微段仍能碰到新网格。能否再切由意图消费走廊决定，不是「碰到 keep 就再切一刀」。

## 5. 隧道（快划漏切）

| 原因 | 对策（本仓已有或该加） |
|------|------------------------|
| `pointermove` 合并 | `getCoalescedEvents`（已有） |
| 两点跨过整块 | `INTERP_GAP` 插值（已有）；段与凸包求交，不是点采样 |
| 停住蹭到 | 段长 < 很小阈值不切（对齐 `minSliceVelocity`） |
| 3D 厚板射线漏 | 轮廓 clip **或** 段上若干射线，现 `strokeHitsMesh` 可缩到这一段 |

不要上 Rapier CCD 当刀：刀不是物理体。

## 6. 当时建议的接口（历史；`slicedIds` + 微段 onMove 已有）

```ts
// SlashStroke
cutDone: boolean           // 删
slicedIds: Set<number>     // 本划已删除的 mesh.id

// slashWorld
onMove: (stroke, lastSeg) => tryCutSeg(stroke, lastSeg)
onEnd:  (stroke) => { /* 不再 resolve 整刀 */ overlay 收尾 }

function tryCutSeg(stroke, seg):
  跳过过短 seg
  snapshot = wood.cuttables.slice()
  born = []
  for mesh of snapshot:
    if stroke.slicedIds.has(mesh.id) continue
    target = resolveCutBySegment(mesh, camera, seg)
    if !target continue
    cut + replace
    stroke.slicedIds.add(mesh.id)
    born.push(keep.id, drop.id)
    break  // 先一段一块；要一帧多切就去掉 break
```

`resolveCutBySegment`：现 `resolveCutTarget` 去掉 `phase` / `tipHitsMesh`，弦改为 `clipChordToHull(seg.a, seg.b, hull)`。

## 7. 刻意不采用

- CSG / three-pinata（包体大，本仓剖分已够凸箱）。  
- 剑的 enter+exit 才切（参考作不是这样）。  
- 整划 polyline 对所有物体做 Bentley-Ottmann：物体少，逐段 clip 凸包 O(n) 足够。  
- 把刀做成 Rapier sensor 跟手指：和 390×844 设计坐标 + letterbox 重复，2D 段更稳。

## 9. 反查（对照本仓库，上一轮写错/漏的）

| 上一轮说法 | 代码事实 |
|------------|----------|
| `onMove` 的 `lastSeg` 是 prev→tip | `slashInput.ts`：`hooks.onMove(stroke, [origin, latest])`，`origin = points[0]`。传的是**整刀**。 |
| 插值后每小段都会拿去切 | 插值只往 `points` 里塞点；`onMove` **每个 coalesced 事件调用一次**，参数仍是整刀。 |
| coalesced 已够防漏划 | 方法存在，但真机依赖见 §10。本仓真正防隧道的是 `INTERP_GAP=5`。 |
| 段一过 `minChord` / `throughThreshold(box)` 就切 | 板投影宽可达上百 px，而微段只有 ~5px。**单段永远达不到「划穿整板」阈值。** 连续切若只看 lastSeg，会永远切不到，或只能改成「碰到即切」。 |
| Fruit Ninja 连续切 ≈ 本仓连切剩余木 | 水果切开就飞走，半果几乎不会再被同一刃切。本仓 **keep 钉在原地**，同一划必再碰到新网格。`bornThisSeg` 避免同一微段切两次新生 mesh；**沿已切直线刮 keep 不再出刀** 见 [SLASH-INTENT.md](./SLASH-INTENT.md) 消费层。 |
| 刀面三点不会退化 | Three.js `setFromCoplanarPoints` 共线时 **normal→0，不抛错**（源码注释：*should an error be thrown if normal is zero?*）。微段两端世界点几乎重合时刀面坏掉。 |

`clipPolylineToHull` / `clipChordToHull` 已是凸包线段裁剪（Cyrus–Beck 一类：t∈[0,1] 求进入/离开）。连续切应复用 **折线在该 mesh 上的累计弦**，不要丢去只用 5px 段去比 `throughThreshold(box)`。

出刃 `ARM_DIST=8`：木头上按下后前 8px 不 `onMove`。可接受；若希望「按下拖就切」要下调或出刃后补一段。

`strokeSpeedPxPerSec` 用整划时长，连切后半刀会偏慢。段速度要自己算。

## 10. 补漏检索

### 10.1 碰到 vs 划穿（连续切的核心分叉）

凸包线段裁剪（Cyrus–Beck，1978；综述 https://pmc.ncbi.nlm.nih.gov/articles/PMC9605407/ ）：直线与凸包至多两个交点，标 PE（进）/ PL（出）。本仓 `clipLineToHull` 就是这个。

| 模型 | 何时切 | 适合 |
|------|--------|------|
| 碰到即切 | 段与 hull 相交长度 > ε | Fruit Ninja trigger；绳 |
| 进+出才切 | 本划对该 mesh 先 PE 再 PL | 剑穿模；厚板更像 iSlash |
| 累计弦过阈 | 折线在 hull 内长度 ≥ `minChord` | 本仓现状的「穿过」，但要按 **mesh 累计**，不是单段 |

**推荐落地（板 + 连切）：** 每个 mesh 在本划上记 `entered` / 累计弦。  
- 刀尖离开 hull，或累计弦 ≥ `minChord` → 切。刀面用 **该 mesh 的入点→当前/出点**（不是整刀起点）。  
- 切完删旧 id；keep 是新 id，累计清零，后续段可再积累。  
这样既连续，又不会「刚蹭到边就切」。

不要用 `throughThreshold(投影包围盒)` 去卡 **单段**。

### 10.2 iOS / Capacitor 上的 coalesced

- MDN：`getCoalescedEvents` **不是 Baseline**；Safari / iOS / WebView **18.2** 才有。更早 iOS 上方法可能不存在（本仓已 `typeof === 'function'` 回退）。  
  https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getCoalescedEvents
- 规范标 **Secure Context**。`capacitor://` / `https` 一般算安全；不要假设桌面 Chrome 的采样密度 = 真机 WKWebView。
- 2024-08 才有 iOS 实现（WebKit rdar 132210576，用 UIKit `coalescedTouchesForTouch`）。
- **插值 `INTERP_GAP` 必须保留**，不能把防漏划押在 coalesced 上。

### 10.3 退化刀面

https://github.com/mrdoob/three.js/blob/dev/src/math/Plane.js  
`setFromCoplanarPoints`：normal = (c−b)×(a−b)，共线则零向量。  
连续切微段时：世界点 a、b 很近 → 与相机三点近共线。

补：若 `|normal|² < ε`，改 `normal = (worldB−worldA) × camera.forward`（或 `subVectors(b,a).cross(cam.getWorldDirection)`），再 `setFromNormalAndCoplanarPoint`。Zigurous 刀向是 **这一帧位移**，不建三点平面（2D 游戏）。

### 10.4 同划再切钉住的块

没有现成引擎 API。正确性靠：

1. 删旧 mesh，新 keep/drop 新 `id`。  
2. 本段出生的 id 本段不测。  
3. 下一微段才允许切 keep。  
4. 一段一块（`break`），避免一帧沿同一直线把板切成条。

Fruit Ninja 半果飞走，不覆盖这个问题。

## 11. 当时落地顺序（历史；微段 / slicedIds / 余势已落地，刀面退化回退见切开路径）

1. `lastSeg` 改成真正的 **points[n-2]→tip**（插值点也逐段 `onMove`）。  
2. 每 mesh 本划状态：入点、累计弦；离开或过 `minChord` 再切。  
3. 去掉 `cutDone`；`slicedIds` + `bornThisSeg`。  
4. 刀面退化回退。  
5. 冲量用段方向；滑速用段/Δt。  
6. 真机不依赖 coalesced。

---

## 13. 第三轮检索（反查之后）

针对 §9–11 的缺口：3D 里「刃段当场切、新块可再切」怎么写；刀面第二向量从哪来；真机取消。

### 13.1 Valem + EzySlice（3D 连续切的现成写法）

VR 剑切（Valem，EzySlice）：每物理帧 `Physics.Linecast(刃根, 刃尖)`，**打中立刻 Slice**，删旧物体。作者注明：新块设回可切 layer，**切开后还能再切**。

刀面法线：

```
planeNormal = Cross(刃尖 - 刃根, 挥剑速度)
```

EzySlice API 是 `Slice(点, 法线)`，不是三点定面。两点 + 法线，共线时只要 Cross 的两边不平行就不会零。

手指没有「刃长 × 挥速」两个方向：滑速和段方向几乎共线，`Cross(seg, velocity)` **会退化**。第二向量必须另取。手指划切的对应物是：

```
n = normalize( Cross(world(seg.b) - world(seg.a), camera.getWorldDirection()) )
plane.setFromNormalAndCoplanarPoint(n, world(seg.a))
```

这就是「刃在屏上划过、刀面立着朝向玩家」。与现仓「相机 + 两端」三点法在几何上同类，但 **显式 Cross 可先检查 `|n|²`**， degenerate 时用上一刀法线或 `Cross(seg, camera.up)`。

来源：https://www.youtube.com/watch?v=GQzW6ZJFQ94 评论与脚本；https://github.com/DavidArayan/ezy-slice `Slice(position, direction)`。

### 13.2 Linecast ↔ 本仓 2D 段

| Unity VR | 本仓 |
|----------|------|
| 每帧刃段世界 Linecast | 每微段 `clipChordToHull`（已有） |
| hit.collider → Slice | hull 相交且该 mesh 累计够 → `cutMeshBySlash` |
| 新 GO 设 sliceable | 新 mesh 进 `cuttables`，新 `id` |
| 刃还在物体里会再 Linecast 到新块 | `bornThisSeg` 跳过本段，下一段才允许 |

Linecast 是「碰到即切」。板要「划穿」：对该 mesh **累计 PE→PL 或累计弦**，切的时候刀面仍用 **入点→出点**（或入点→当前刀尖）+ 上式法线。不要用 Linecast 语义去比整板 `throughThreshold`。

### 13.3 iOS 划切会被系统掐掉

- `touch-action: none`（本仓 `#stage` 已设）才能避免 Safari 把划势交给滚动/缩放。
- 系统手势（底栏上滑、边缘返回）会发 **`pointercancel`**。本仓已 `onCancel`→`finish`。连切时 cancel = 收刀，已切的块保留，未完成累计的那块不切。
- 规范：触屏 **隐式 pointer capture**（pointerdown 目标自动捕获）。`setPointerCapture` 仍应保留（本仓已有）。
- coalesced 仍按 §10.2：iOS 18.2 前当不存在；**插值必须留**。

### 13.4 本轮对落地清单的增量

在 §11 上追加：

7. 刀面优先 `Cross(刀向, 相机朝向)`，三点法只作备选；`|n|² < ε` 再 `Cross(刀向, camera.up)`。  
8. 几何切开：只切 `userData.profile`，两块再竖直挤出 + 半平面内收倒角。锐角丢掉内顶点并补面封口。不要 CSG、不要锥台、不要整块降 inset。规范见 [SLASH-DESIGN.md](./SLASH-DESIGN.md)「几何」。  
9. `pointercancel` = 收刀，不清场景。  
10. Linecast 式「碰到就切」只适合飞出的水果；钉住的木走累计划穿。

---

## 14. 多指独立划 — 检索计划（三轮）

政策：[SLASH-INTENT.md](./SLASH-INTENT.md)（每指一条划，最多 3，同 mesh 一把锁 A；真贯穿只约束持锁那一划）。  
本检索只核接线，不改切几何。

### 计划清单（反查补漏后）

| # | 查什么 | 文件 | 期望 |
|---|--------|------|------|
| A | 活划表、上限、非主指针 | `slashInput.ts` | `Map<pointerId>`，`START.maxStrokes`，无 `isPrimary` |
| B | 每指刀痕 begin/push/end | `slashDebug.ts` `slashTrail.ts` | 按 id；end 不误清其它指 |
| C | 同板占用 | `slashWorld.skipMeshes` | 其它划的 `enterLock` + `progress` 进 `skipIds` |
| D | 意图仍按单划 | `slashIntent.ts` | 只吃传入的 stroke + skipIds |
| E | 余势只拦本划 | `slashFollow.ts` | 另一指可切刚切开的 keep（新 id） |
| F | 夹缝 / 刀光 / 取消推进 | overlay、`screenShake` | 全局一份；计划里写明，不是漏接 |
| G | 音/震 | `boardFingers` | 最后一指离开才停 |
| H | cancel / capture | `slashInput` `#stage` | `pointercancel` 只收该 id；`touch-action: none` |
| I | 刀痕 Map 生命周期 | overlay `trails` | **缺口**：end 不 `delete`，pointerId 递增会积 |
| J | 一段贯穿 vs 占用 | `resolveCutBySegment` | skip 拦 lock/progress，不拦占用前的一刀贯穿 |
| K | 调试 HUD | `setIntentDebug` | 最后一次 onMove 覆盖 |
| L | 顿帧 / 入场 | `pendingFly` `slowLeft` `enter.meshId` | 全局；一指切开冻物理，其它指仍可输入 |
| M | letterbox | `lastInBoundsSeg` | **死代码**，划出设计区仍进判定（旧问题） |
| N | `lostpointercapture` | `slashInput` | `finish(id)` |
| O | `input.stroke()` | `slashInput` | 仍导出第一个；世界已改 `strokes()` |

### 第一轮

对照 A–H 读现码。

- A 已落地：`live` Map，满 3 再 down 直接 return。
- B `begin(id)` 不再 `wipe` 整画布；`end(id)` 只 `trail.end()`。
- C `skipMeshes` 在 `createSlashInput` 之前闭包 `input`，onMove 时 `input` 已赋值，可用。
- D `stepSlashIntent(..., skipIds)` 世界传入 skip。
- E 余势挂在切开那条 stroke 上；另一指 skip 里没有 keep 新 id。
- F 夹缝 `find(enterLock)` 一条；`cancelFlash` / `pushIn` 全局。
- G `boardFingers`；`applyCommit` 里 `size <= 1` 才 `resetSlide`。
- H `onCancel` 按 id `finish`；`#stage` 与 input 都 `touch-action: none`。

**本轮补进计划：** I（刀痕泄漏）、J（贯穿时序）、K（HUD）。

### 第二轮

针对 I–K、L、M。

- I `trails.get(id)?.end()` 不 `trails.delete(id)`。丝带仍会按 `TRAIL.life` 画完，但 Map 项常驻。
- J 占用者尚未 `lockEnter` 时，后指 `一段贯穿` 仍可 `commit`（`skipIds` 为空）。事件串行，先 lock 的下一微段才占用。
- K 对缝调试被后动的那指覆盖；`strokeCuts` 混所有指。
- L `slowLeft` 终刀减速是世界时间；其它指 onMove 不停。`enter.meshId` 切后改 keep，另一指 skip 的是旧 id。
- M `lastInBoundsSeg` 无引用。多指不放大此洞，也不修。

**本轮补进计划：** N（lostpointercapture）、O（废弃 `stroke()`）、切开重击停掉另一指持续震。

### 第三轮

- N 无 `lostpointercapture`。iOS 隐式捕获 + 已有 cancel，真机边缘手势仍可能只 cancel 一指（正确）。桌面丢失捕获可能留死划，直到 window `pointerup`。
- O `stroke()` 仍导出，`src/game` 无调用。
- `onCut` 先 `stopContinuous` 再重击；另一指还在板上要等它下一次 `onFrame` 才续震。可接受。
- `preventDefault` 只在 down；move 未 prevent。`touch-action: none` 足够。
- 第四指无提示。
- 两指几乎同时 `pushIn`：后一次从当前 dolly 再推进。

### 三轮后的落地（已改）

1. 刀痕 `spent` 后从 Map 删除。  
2. `cancelFlash` / `allowCrack` / `setCrack` / `retractCrack` 带占用者 id。  
3. `lostpointercapture` → `finish(id)`。  
同 mesh 双切排队不做。letterbox 仍旧问题，不绑多指。

---

## 12. 来源

| URL | 用处 |
|-----|------|
| https://github.com/zigurous/unity-fruit-ninja-tutorial | 刃生命周期、速度门槛、trigger 即切 |
| https://github.com/mirael-miracle/FruitNinjaMediaPipe/blob/main/unity-fruit-ninja-tutorial/Assets/Scripts/Blade.cs | 同结构 Blade.cs |
| https://developers-codex.hashnode.dev/slicing-through-code-how-i-built-fruit-ninja | OnTriggerEnter 换模型 |
| https://threejs.org/docs/#examples/en/misc/ConvexObjectBreaker | 子块可立刻再切 |
| https://github.com/mrdoob/three.js/blob/master/examples/jsm/misc/ConvexObjectBreaker.js | cutByPlane 返回两块 |
| https://github.com/dgreenheck/three-pinata | sliceWorld 递归切 |
| https://github.com/w3c/pointerevents | coalesced |
| https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getCoalescedEvents | Safari 18.2；Secure Context |
| https://bugs.webkit.org/show_bug.cgi?id=277185 | iOS coalesced 实现 |
| https://pmc.ncbi.nlm.nih.gov/articles/PMC9605407/ | Cyrus–Beck 凸包线段进/出 |
| https://github.com/mrdoob/three.js/blob/dev/src/math/Plane.js | 共线三点 normal=0 |
| https://rapier.rs/docs/user_guides/javascript/colliders | 删/建 convex |
| https://discussions.unity.com/t/detect-object-slicing-passing-through-another-object-completely/921898 | enter/exit 穿模（对照） |
| https://github.com/DavidArayan/ezy-slice | `Slice(点, 法线)`；三角对平面 |
| https://www.youtube.com/watch?v=GQzW6ZJFQ94 | 刃段 Linecast 当场切；新块可再切；`Cross(刃, 速度)` |
| https://w3c.github.io/pointerevents/#implicit-pointer-capture | 触屏隐式捕获 |
| https://bugnet.io/blog/fix-construct3-touch-events-not-firing-ios-pwa-mode | iOS `pointercancel` / `touch-action` |
