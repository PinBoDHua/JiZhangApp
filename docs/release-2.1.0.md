# 工时账本 2.1.0 发布计划与验收

- 版本：2.1.0
- 日期：2026-10-26
- 基线：2.0.0（91 个单元测试、Capacitor 8、Android API 36）
- 主题：**让每一次点击都有回应**

## 1. 为什么是 2.1

2.0.0 把「算得准、看得远、存得稳」补齐之后，产品能力已经不弱，但高频操作的反馈仍然是「表单工具」级别：

- 页面切换只有新页淡入，旧页瞬间消失，没有方向感；
- 底部浮层只能点关闭按钮，不能下拉，打开时背景还能滚；
- 月历左右滑动没有跟手反馈，月份数字硬切；
- 金额、图表、进度条都是瞬时变化，数据变化缺少「发生了什么」的提示；
- 深色/浅色切换是瞬间换色；
- 没有任何触感反馈，也没有把 `prefers-reduced-motion` 真正落实到 JS 驱动的动画。

2.1.0 不新增业务数据字段，专门打磨这些「每天都重复几十次」的过渡与手感；同时用 `docs/competitive-analysis-motion.md` 把同类产品的优秀功能和后续路线固定下来。

## 2. 范围

| 方向 | 内容 | 用户价值 |
| --- | --- | --- |
| 页面过渡 | View Transition + 方向感知的先退后进；旧浏览器 CSS 回退 | Tab 切换不再硬切，前后关系清楚 |
| 浮层手感 | 抓取条、跟手拖拽、阻尼、回弹/关闭、背景联动、统一退场、滚动锁 | 单手关闭面板更自然，保存/删除不再瞬间消失 |
| 数据动效 | 金额滚动（带范围感知）、进度条展开、图表交错生长、列表 stagger | 数据变化看得见，但不过度花哨 |
| 月历手势 | 跟手位移、卡片阴影、方向滑入、选中日颜色/阴影过渡、日详情过渡 | 滑动切月有反馈，误触更少 |
| 主题与触感 | 点击位置圆形显影、Android 轻振动、按压反馈、开关回弹 | 操作有回应，夜班切换更顺滑 |
| 可访问性 | 减少动态效果全量降级、View Transition 能力检测、CSS 回退 | 眩晕敏感用户和旧设备都能正常用 |

### 明确不做

- 不改数据格式、不改备份版本：2.1.0 与 2.0.0 的 localStorage 键和备份完全兼容。
- 不引入 Framer Motion 等动画库：保持包体，使用 CSS + View Transition + 几个小 hook。
- 不做自动播放的彩带、音效或全屏庆祝：保持工具型产品的克制。
- 不在这一版实现工作日/节假日倍率、CSV 导入、小组件、云同步等 P1 功能；路线图见对比文档第 3 节。

## 3. 设计要点

### 3.1 动效 token

```css
--ease-enter: cubic-bezier(0.22, 1, 0.36, 1);
--ease-exit: cubic-bezier(0.4, 0, 1, 1);
--ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
--ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1);
--ease-sheet: cubic-bezier(0.33, 1, 0.68, 1);
--dur-tap: 0.16s;
--dur-enter: 0.38s;
--dur-exit: 0.22s;
--dur-sheet: 0.34s;
```

- 进场减速、退场加速；高频点击反馈 160ms，浮层进场 380ms / 退场 220ms，页面约 340ms。
- 所有新增动画只改 `transform` / `opacity`；进度条用 `scaleX`，避免触发布局。

### 3.2 页面过渡

- `runScreenTransition(update, direction)`：支持 `document.startViewTransition` 时用 `flushSync` 同步提交 React 状态，让浏览器拍照；不支持时直接更新，交给 CSS `.screen-slot` 的 `screen-in`。
- `html[data-motion='view-transition']` 下禁用旧的 CSS 进场，避免两套动画叠加。
- 只给 `.app-main` 临时加 `view-transition-name: app-screen`，底栏和浮层不参与页面滑动。
- 旧页 120ms 淡出，新页延迟 120ms、220ms 淡入；先退后进，避免两页文字重影。
- 快速连点或已有过渡进行中时直接更新，不排队。

### 3.3 浮层物理

- 拖拽只从抓取条和标题栏开始，忽略按钮/输入框；使用 Pointer Capture，鼠标和触摸一致。
- 位移超过 160px 后阻尼 0.35；向上最多 -14px。
- 松手：位移 > 96px 或速度 > 0.5px/ms 关闭，否则 340ms 弹簧回位。
- 入场 380ms、`cubic-bezier(0.33, 1, 0.68, 1)`：前 60ms 只走约 27%，不会像旧版那样前 60ms 冲过 67% 后长时间停顿；不使用向上过冲，避免小面板底部露出缝隙。
- 关闭统一由 App 的 `sheetClosing` 驱动：`BottomSheet` 只负责请求关闭，App 等 220ms 后再卸载；保存、删除、返回键、Esc、点背景、关闭按钮共用一条路径。
- 打开时给 `<html>` 加 `sheet-open`，锁住 `.app-main` 滚动；`.app-main` 设置 `scrollbar-gutter: stable`，桌面端滚动条槽位不会因锁滚动而消失，避免背景内容横向跳变。确认弹窗用 `dialog-open` 同理。

### 3.4 数字与范围

```ts
useAnimatedNumber(value, { resetKey: `${period}-${rangeStart}` })
```

- 同一范围内值变化：620ms ease-out cubic 滚动。
- `resetKey` 变化（换月、换周、换年、换统计周期）：下一帧直接切到新值。
- 首次挂载不滚动，避免每次进入页面都从 0 重数。
- 渲染层再做一次 `keyRef` 对比，避免「新范围 + 旧金额」在 effect 前闪一帧。

### 3.5 减少动态效果

- `initMotion()` 在启动时标记 `data-motion`。
- `prefersReducedMotion()` 用 `matchMedia` 实时判断，跳过 View Transition、数字滚动和振动。
- CSS 全局 `@media (prefers-reduced-motion: reduce)` 将动画/过渡压到 0.01ms，并显式关闭 hero 脉冲、计时圆点和 View Transition 伪元素动画。
- 动画不阻塞焦点、Esc、返回键、按钮点击。

## 4. 验收清单

- [x] `npm run typecheck`（strict）通过
- [x] `npm run lint` 0 warning / 0 error
- [x] `npm test` 97 个测试全部通过（新增 6 个动效辅助测试）
- [x] `npm run build` 生成 `dist/` 与 `sw.js`
- [x] Playwright（Edge，390×844）浅色/深色截图检查
- [x] 页面切换中段无文字重影，底栏在过渡开始时已切到新 Tab
- [x] 浮层拖拽可关闭、可回弹，背景随位移变淡
- [x] 点击日历日期打开浮层时，背景日历选中格尺寸保持不变（42.3 × 44），无缩放拉伸
- [x] 浮层入场在 60 / 120 / 200ms 的时间点平滑推进，不出现前段猛冲、后段停顿
- [x] 删除记录 → Toast 撤销，浮层先退场再卸载
- [x] 月历切换后金额立即显示新月份值
- [x] 主题圆形显影正常
- [x] `prefers-reduced-motion: reduce` 下无 View Transition
- [x] 手动移除 `startViewTransition` 后回退到 CSS 进场动画
- [x] 浏览器控制台无 error
- [x] `npx cap sync android` 成功
- [x] Gradle `assembleRelease` 使用原 keystore 生成签名 APK
- [x] `release/工时账本-2.1.0.apk` 与 `release/GongshiLedger-v2.1.0.apk`
- [x] Android `versionCode = 13`、`versionName = 2.1.0`
- [x] APK 签名校验通过（CN=Gongshi Ledger），`VIBRATE` 权限已打入安装包

## 5. 交付物

- 源码：`src/motion.ts`、`src/feedback.ts`、`src/hooks/useAnimatedNumber.ts`、`src/components/BottomSheet.tsx`、`src/components/BottomNav.tsx`、`src/components/Calendar.tsx`、`src/components/Toast.tsx`、`src/index.css`
- 文档：`docs/competitive-analysis-motion.md`、`README.md`、`CHANGELOG.md`、本文件
- 安装包：`release/工时账本-2.1.0.apk`、`release/GongshiLedger-v2.1.0.apk`
- 发布签名继续使用 `android/keystore/shift-ledger.jks`，后续版本必须沿用同一签名覆盖安装

## 6. 风险与回退

- **浏览器差异**：View Transition 在较新的 Chrome/Android WebView 可用；Safari 和旧 WebView 回退到 CSS 进场。动画只影响观感，不影响功能。
- **拖拽误触**：拖拽只从抓取条/标题栏开始，表单滚动区不受影响；超过阈值才关闭，否则回弹。
- **减少动态效果**：JS 和 CSS 双重判断，避免「CSS 关了但 JS 还在跑」。
- **振动**：只在 Android App 且系统允许时触发；`VIBRATE` 是普通权限，无运行时弹窗。关闭系统触感/动画后应用会一起降级。
- **数据兼容**：2.1.0 不改变存储键、备份版本和计薪算法，可随时回退到 2.0.0；2.1 写入的数据 2.0 也能读。
- **回退**：如遇动效相关问题，可临时把 `initMotion()` 的 `data-motion` 固定为 `css`，或回退本次样式/组件改动；业务数据不受影响。
