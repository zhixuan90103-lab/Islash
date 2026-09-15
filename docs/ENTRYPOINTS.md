# 入口与调用链

## 1. 命令

| 命令 | 结果 |
|------|------|
| `npm run dev` | http://127.0.0.1:5190/（占用时可换端口） |
| `npm run build` | `tsc` 检查 + `dist/`（相对路径） |
| `npm run cap:sync` | build + cap sync ios |
| `npm run ios:bootstrap` | 首次 / 改 Swift：拷插件 + storyboard + SceneDelegate |
| `npm run ios` | build + sync + 开 Xcode（`com.wangzhixuan.islash.cut`） |

## 2. Web 启动链

```
index.html
  → style.css
  → main.ts
       → applyNativeClass / safeArea
       → createRenderer(#stage)
       → 水色背景（backdrop.ts）/ 相机 / VIEW 灯光
       → mountSlashWorld(#stage, scene, camera, getLayout)
       → mountDevicePreview → computeStageLayout → applyStageTransform
       → watchStageLayout
```

## 3. DOM

```
#shell
  #viewport
    #app
      #stage
        canvas
        #ui-root
#device-switcher / #device-label   (web only)
```

## 4. iOS

震动插件 **不会**随 `cap:sync` 自动注册。第一次 / 改插件必须 `ios:bootstrap`。步骤见 [HAPTICS.md §0](./HAPTICS.md)。

```
ios:bootstrap
  → 拷 plugins/native-haptics → ios/App/App
  → Main.storyboard customClass = BridgeViewController
  → SceneDelegate.rootViewController = BridgeViewController()   ← Capacitor 8 必改
Xcode Run 真机
  → SceneDelegate 创建 BridgeViewController
  → capacitorDidLoad → registerPluginInstance(AdvancedHapticsPlugin)
  → load App/public (= dist)
  → 同上 Web 链
  → HUD「点我震动」→ haptics.impact('medium')
```

HUD 状态行有 `plugin: true/false`。`false` = 仍在默认 `CAPBridgeViewController`，插件未进 JS `PluginHeaders`。

## 5. 改配置找谁

| 要改 | 文件 |
|------|------|
| base / 端口 | `vite.config.ts` |
| appId | `capacitor.config.ts` |
| 设计分辨率 | `design.ts` + `style.css` |
| 震动原生 | `plugins/native-haptics/*.swift` + bootstrap |
| 启动 / 场景 | `index.html` + `main.ts` |
| 划切规则与参数 | `src/game/design.ts` · [SLASH-DESIGN.md](./SLASH-DESIGN.md) |
| 木头网格 / 倒角 | `src/game/wood.ts` · 同上文档「几何」 |
| 背景 / 灯光 / 木色 | `VIEW` + `src/game/backdrop.ts` + `src/main.ts` |
| 音效（规划） | [AUDIO.md](./AUDIO.md) |
| 震动接线 | [HAPTICS.md](./HAPTICS.md) |
