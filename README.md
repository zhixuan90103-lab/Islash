# Islash Cut

竖屏 WebGPU 壳上的 **划切练习原型**：滑动=刀，板=木头，划穿 1 变 2。

壳来自 **niantu** 适配/TS/设备预览 + **three-webgpu-cap-shell** 打包。玩法规范：[docs/SLASH-DESIGN.md](./docs/SLASH-DESIGN.md)。

| 文档 | 用途 |
|------|------|
| [AGENTS.md](./AGENTS.md) | AI / 新窗口第一入口 |
| [docs/SLASH-DESIGN.md](./docs/SLASH-DESIGN.md) | 划切规则、参数表、模块 |
| [docs/SLASH-RESEARCH.md](./docs/SLASH-RESEARCH.md) | iSlash Masters / 切开几何调研 |
| [docs/SLASH-TECH.md](./docs/SLASH-TECH.md) | 连续滑动切割的技术检索 |
| [docs/SLASH-TRAIL.md](./docs/SLASH-TRAIL.md) | 常规刀痕拖尾 |
| [docs/ENGINEERING.md](./docs/ENGINEERING.md) | 壳的设计决策与踩坑 |
| [docs/ENTRYPOINTS.md](./docs/ENTRYPOINTS.md) | 入口与调用链 |
| [docs/MERGE.md](./docs/MERGE.md) | 双工程合并说明 |
| [docs/AUDIO.md](./docs/AUDIO.md) | 音效方案（未实现） |
| [docs/HAPTICS.md](./docs/HAPTICS.md) | 震动接线（本玩法未接刀震） |

## 30 秒上手

```bash
npm install
npm run dev
# → http://127.0.0.1:5190/
```

应看到：桌面手机框、青绿水纹背景、橙色木板、划痕、右下角调试面板。在板上划穿 → 大块留下、小块飞出。切边和外轮廓是同一圈窄倒角（侧面竖直，只削朝镜头那一圈；几何见 [SLASH-DESIGN.md](./docs/SLASH-DESIGN.md)）。

## 合并了什么

| 来自 niantu | 来自 three-webgpu-cap-shell |
|-------------|----------------------------|
| TS strict | `base: './'` |
| 390×844 stage + contain | `contentInset: never` + scroll 关 |
| Phone / Pad 预览 | `--safe-*` HUD + debug |
| `clientToDesign` | `ios:bootstrap` 插件真源 |
| | 可验证 3D demo + 震动按钮 |
| AdvancedHaptics 宽 API | ENGINEERING / ENTRYPOINTS 文档结构 |
| Capacitor 8 + Three 0.178 + Vite 6 | |

## iOS 真机

包名 **`com.wangzhixuan.islash.cut`**，显示名 **Islash Cut**（勿与旧 hapticstest 混用）。

```bash
npm run ios             # 日常：build + sync + 开 Xcode
npm run ios:bootstrap   # 仅首次或改 Swift 插件
```

Xcode：Signing Team → **真机**（不要 Simulator）→ Run。  
改 Swift 必须 bootstrap，否则 Capacitor 8 默认 `CAPBridgeViewController` 不注册插件。

## 复用到新游戏

1. 复制本目录  
2. 改 `capacitor.config.ts` 的 `appId` / `appName`  
3. 在 `src/main.ts` 或 `src/game/*` 写玩法  
4. **保留** adapt / create-renderer / haptics / plugins / `base: './'`  
