# 工时账本 2.2.0 发布计划与验收

- 版本：2.2.0
- 日期：2026-10-27
- 基线：2.1.0（97 个单元测试、Motion 2.1、Capacitor 8、Android API 36）
- 主题：**算对每一班，补上漏掉的班**

## 1. 为什么是 2.2

2.0 把计薪、预测、复盘做深，2.1 把过渡和手感补齐。对照 `docs/competitive-analysis-motion.md` 的 P1 路线图，剩下最影响日常使用的三件事都不是「动效」，而是「少操作」：

- 每次遇到周末或节假日都要手动把倍数从 1× 改成 2× / 3×，改漏一次就少算钱；
- 漏记一整周时只能一天一天点「记一班」，比竞品的批量补记慢一个数量级；
- 从旧 App 或 Excel 迁过来时只能手输，CSV 导入是迁移的最后一道门槛。

2.2 只做这三件事，外加一个成本很低但高频的入口：桌面长按快捷方式。数据格式保持 v2 键结构，备份升到 v3 以携带日期倍率，旧备份仍可导入。

## 2.范围

| 方向 | 内容 | 用户价值 |
| --- | --- | --- |
| 日期倍率 | 周末 / 节假日倍数规则、节假日日期管理、表单自动带出 | 不用每次手改倍数，周末和节假日不再算错 |
| 批量补记 | 日期区间 + 重复星期 + 冲突跳过 + 撤销 | 漏记一周一次补齐，不必重复填表 |
| CSV 导入 | 表头识别、格式归一化、去重、导入前摘要 | 从 Excel / 旧 App 迁移不必手输 |
| 快捷方式 | Android `shortcuts.xml` + PWA manifest + 深链解析 | 从桌面直接进入高频动作 |
| 数据层 | 备份 v3、偏好新字段、向后兼容 | 新设置能备份，旧备份不丢 |

### 明确不做

- 不做自动节假日库（需要联网或内置年度数据，维护成本高）；先支持手动添加调休与法定节假日。
- 不做 CSV 列映射 UI：只识别常见表头，其余列忽略；复杂表格建议先整理表头。
- 不做批量编辑 / 批量删除：本版只补记新增，避免误改历史记录。
- 不做月报图片分享与 Android 桌面小组件：留到 2.3（需要画布排版与 AppWidget / 前台服务）。
- 不改 localStorage 键名，不回写历史记录的倍数。

## 3. 设计要点

### 3.1 日期倍率优先级

```
节假日日期（用户显式添加） > 周六 / 周日 > 工作日（1×）
```

- 规则开关关闭时，所有日期都按 1×，与 2.1 行为一致。
- 倍数只在「新建」时带出：编辑历史记录、从排班转入、点「复制上一班」都不会被规则覆盖。
- 日期改动时，若用户没有手动点过倍数，会重新按当天规则带出；手动点过之后尊重用户选择。
- 记录落库仍保存 `multiplier` 快照，因此改规则不会改变已有金额，也不会影响工资条和 CSV。

### 3.2 批量补记边界

- 日期区间按「开始 ~ 结束（含）」枚举，按 `Date#getDay()` 过滤星期。
- 单次最多 62 天，避免误选一年把界面和存储撑爆；超出时只取前 62 天并提示。
- 已有记录的日期直接跳过，不覆盖、不合并；命中的日期若存在排班，生成记录时一并写入完成历史（与单条「记这一班」一致）。
- 倍数默认按每天日期独立计算，因此一周补记会得到「工作日 1×、周末 2×」；切到「统一倍数」后所有日期使用同一值。
- 生成后 Toast 提供撤销，撤销会同时恢复记录、排班与完成历史快照。

### 3.3 CSV 导入

- 解析器按 RFC 4180 的最小子集实现：引号字段、`""` 转义、CRLF、UTF-8 BOM。
- 表头别名见 `src/csv.ts` 的 `HEADER_ALIASES`；必需列是「日期 / 开始 / 结束」，时薪缺省时用匹配班次或第一个模板的时薪。
- 日期接受 `2026-10-01`、`2026/1/5`、`2026.1.5`；时间接受 `9:00`、`08：30`。
- 去重键为 `日期 + 班次 + 开始时间`，同时对比现有记录与文件内已解析行。
- 导入前用确认弹窗展示：读取行数、将导入条数、跳过条数、格式错误条数与首条错误；导入后追加并支持撤销。

### 3.4 快捷方式

| 入口 | 地址 | 处理 |
| --- | --- | --- |
| PWA / 网页 | `/?action=record` 等 | 启动时读取 query，打开对应浮层后 `replaceState` 清掉参数 |
| Android 桌面 | `gongshi://record` 等 | `MainActivity` 的 VIEW intent → Capacitor `appUrlOpen` → 同一套动作 |

四个动作：`record`（记一班）、`timing`（打卡计时）、`batch`（批量补记）、`stats`（本月统计）。初始 query 延后一帧执行，等默认模板就绪后再打开浮层，避免闭包拿到空模板。

## 4. 验收清单

- [x] `npm run typecheck`（TypeScript 7，strict）通过
- [x] `npm run lint` 0 warning / 0 error
- [x] `npm test` 125 个测试通过（97 → 125，新增 28 个）
- [x] `npm run build` 生成 `dist/` 与 `sw.js`
- [x] Playwright（Edge，390×844）浅色 / 深色截图检查
- [x] 设置页可开启日期倍率、切换周末 / 节假日倍数、添加与删除节假日
- [x] 记一班切到周六时自动选中 2×，提示「周六 · 2×」，预计收入同步变化
- [x] 批量补记默认最近 7 天，命中 7 天、56 小时、¥1,440（含周末 2×）
- [x] 批量补记日期输入在 390px 宽度下不截断
- [x] 批量补记翻到底部可看到汇总与撤销提示
- [x] 深色模式浮层与设置页对比度正常
- [x] 浏览器控制台无 error
- [x] `npx cap sync android` 成功
- [x] Gradle `assembleRelease` 使用原 keystore 生成签名 APK
- [x] `release/工时账本-2.2.0.apk` 与 `release/GongshiLedger-v2.2.0.apk`
- [x] Android `versionCode = 14`、`versionName = 2.2.0`
- [x] APK 内含 `shortcuts.xml` 与 `gongshi` scheme

## 5. 交付物

- 源码：`src/dayRule.ts`、`src/batch.ts`、`src/csv.ts`、`src/shortcuts.ts`、`src/components/BatchRecordSheet.tsx`、`src/components/Settings.tsx`、`src/components/RecordSheet.tsx`、`src/components/PlanSheet.tsx`、`src/App.tsx`、`src/index.css`
- 原生：`android/app/src/main/res/xml/shortcuts.xml`、`AndroidManifest.xml`、`res/values/strings.xml`
- 文档：`README.md`、`CHANGELOG.md`、本文件
- 安装包：`release/工时账本-2.2.0.apk`、`release/GongshiLedger-v2.2.0.apk`
