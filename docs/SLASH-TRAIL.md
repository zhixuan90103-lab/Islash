# 常规刀痕拖尾怎么做

调研结论。本仓现状：按路径长度截 ~78px 的 2D 丝带，刀尖宽、尾细，松手立刻清。和业界默认不完全一样。

拖尾是**表现**，和「一刀贯穿」判定无关。

## 1. 业界默认：按时间活着的丝带

Unity `TrailRenderer`（Fruit Ninja 教程、Zigurous 都用这个）：

| 参数 | 含义 | 刀痕常用 |
|------|------|----------|
| **Time** | 每个点活多久 | 0.1–0.3 s（Zigurous 直播里约 0.1） |
| **Width** | 沿长度的宽度曲线 | **新生点（刀尖）宽，最老点（尾）宽≈0** |
| **Min Vertex Distance** | 走出这么远才采样新点 | 避免点挤在一起拧带 |
| **Color** | 沿长度的透明度/颜色 | 尾更淡 |
| **Clear / Emitting** | 按下 Clear 并开始记点；抬手停记，点自己过期 |

文档：https://docs.unity3d.com/Manual/class-TrailRenderer.html  
`startWidth` = 出生点（刀尖），`endWidth` = 最老的点（尾）。曲线 key `0→0`（尾）、`1→1`（头）。

要点：**长度由时间决定，不是固定像素。** 划得快，0.2s 内走出的路径长，拖尾就长；停住，旧点过期，尾巴自己收掉。我们现在按 78px 截，停住时尾巴还挂在那儿，直到松手才清。

## 2. 三种常见画法

### A. 引擎 Trail（最常见）

物体跟着手指，组件自动记点、挤三角形带。材质用粒子/加色（白或刃光）。圆头：`numCapVertices`。

### B. 三角带 + 贴图（Fruit Ninja 味更重）

Cocos **CCBlade**（明确写成 Fruit Ninja blade）：

- 点列 `push`，超过 `pointLimit` 或按 `drainInterval` **从尾 pop**
- 每个点沿法线挤出，生成 `vertices` + `texCoords`
- 一张 128×16 条带图：`head | body | tail | unused`，U 沿刀长映射

https://github.com/jandujar/CCBlade

iPhone 讨论同样两路：单四边形拉长（只适合直刀）；或 **triangle strip** 跟折线（弯刀）。  
https://stackoverflow.com/questions/4085569/how-would-a-cutting-effect-be-implemented-on-iphone

Flutter 切片教程：左右各一条平行 path（双刃），再填回中线。  
https://www.flutterclutter.dev/flutter/tutorials/flutter-game-tutorial-fruit-ninja-clone/2020/951/

### C. 每帧一段、按年龄淡出（简易克隆）

每段位移生成一根短 rect/div，活 200–350ms，`opacity = 1 - age/life`。弯刀靠很多短段拼接。便宜，接缝难看。

## 3. 形状约定

| 项 | 常规 |
|----|------|
| 宽 | 刀尖最宽，尾巴收成尖（width curve） |
| 长 | **寿命 × 速度**，不是整段滑动路径 |
| 停 | 不停手也会缩短（点过期） |
| 抬手 | 不再加点；残影按寿命淡出（可留一帧），不是瞬间消失 |
| 按下 | `Clear()`，避免接上一刀的尾巴 |
| 采样 | 最小间距；快划插值（本仓已有 coalesced + INTERP_GAP） |
| 转弯 | 用法线挤带；点太密 + 急转会翻面，要限制最小距离 |

刀痕常加：加色混合、短 glow、头一个小圆点。判定碰撞用刃/段，**不用拖尾 mesh**。

## 4. 和本仓的差别

| | 本仓现在 | 常规 Trail |
|--|----------|------------|
| 截断 | **已改**：点寿命 `TRAIL.life`（默认 0.18s） | 点寿命 0.1–0.3s |
| 停住 | 旧点过期，尾巴收 | 尾巴收掉 |
| 抬手 | `end()` 停采样，残影 drain | 残影淡出 |
| 几何 | canvas 填左右轮廓 | 同款丝带，或 GPU Trail |
| 贴图 | 纯白填充 | 常用 head-body-tail 条带图 |

要对齐常规：给每个点打时间戳，每帧丢掉 `now - t > life` 的点，宽度按「点在带上的年龄」或「从尾到头的归一化」采样；抬手只停 `push`，让 drain 跑完。2D canvas 三角带已经接近 B，差的是 **时间 drain** 和可选贴图。

## 5. 来源

- https://docs.unity3d.com/Manual/class-TrailRenderer.html
- https://docs.unity3d.com/ScriptReference/TrailRenderer-widthCurve.html
- https://github.com/zigurous/unity-fruit-ninja-tutorial（TrailRenderer 跟刃）
- https://www.youtube.com/watch?v=xTT1Ae_ifhM / `3g5_8sE18tQ`（Time≈0.1，width 曲线）
- https://github.com/jandujar/CCBlade
- https://stackoverflow.com/questions/4085569/how-would-a-cutting-effect-be-implemented-on-iphone
- https://www.programmersought.com/article/80288369739/（Trail vs Line）
