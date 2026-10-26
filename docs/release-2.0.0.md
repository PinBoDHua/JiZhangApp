# 工时账本 2.0.0 发布计划与验收

- 版本：2.0.0
- 日期：2026-10-26
- 基线：1.9.0（60 个单元测试、Capacitor 8、Android API 36）
- 主题：**算得准 · 看得远 · 存得稳**

## 1. 为什么是 2.0

1.9.0 已经覆盖「记录 → 排班 → 提醒 → 结算」的闭环，但收入计算仍是一班一个倍数：

- 12 小时班需要手动拆成正常和加班，或者填一个混合倍数，月底核对困难；
- 用户知道本月已经赚了多少，却不知道剩余排班能带来多少、月目标还差几班；
- 一年结束以后，数据只能按单月翻看，没有「这一年怎么样」的视角；
- 数据格式仍是 1.x，备份不包含提醒设置，升级路径没有版本标记。

2.0.0 把计算与洞察补上，并给数据层建立可继续演进的版本基线。

## 2. 范围

| 方向 | 内容 | 用户价值 |
| --- | --- | --- |
| 分段计薪 | 标准工时、加班倍数、规则快照、全链路计薪明细 | 长班 / 加班收入算得准，历史金额不漂移 |
| 收入预测 | 已入账 + 待上排班、月末预计、目标达成预测 | 知道这个月还能拿多少、目标还差几班 |
| 年度复盘 | 年度摘要、最高月 / 日、连续出勤、年度热力图、报告导出 | 一年付出看得见，可分享 / 留存 |
| 数据 v2 | 存储键迁移、meta 标记、备份 v2、v1 兼容 | 升级不丢数据，备份更完整 |

### 明确不做

- 不加账号、云同步或服务端：继续保持本机优先、离线可用。
- 不做多岗位 / 多币种：会牵动全部统计和结算口径，留待后续版本。
- 不改变 1.x 记录默认的整班单倍数算法：没有加班规则的记录金额保持原样。

## 3. 设计要点

### 3.1 计薪模型

```ts
interface OvertimeRule {
  standardMinutes: number; // 标准工时，30–1440 分钟
  multiplier: number;      // 加班倍数，> 1 且 ≤ 10
}
```

- 规则可选：`ShiftTemplate`、`WorkRecord`、`PlannedShift`、`ActiveShift` 上都带 `overtime?`。
- 计算：标准工时内 `rate × multiplier`；超出部分 `rate × max(multiplier, overtime.multiplier)`。
- 所有金额保留两位小数；分段金额分别四舍五入后相加，避免展示值与合计差 1 分。
- 记录保存规则快照，后续修改模板不影响历史记录。
- 旧记录没有 `overtime` 时，完全回退到 1.x 的 `净工时 × 时薪 × 倍数`。

### 3.2 预测口径

- 预测 = 当月在记录中的收入 + 结束时间晚于现在的排班预计收入。
- 已结束但未处理的排班不计入预测，避免和「漏记补记」重复计算。
- 预测只作为展示；不写入记录、不影响工资结算。
- 目标相关字段：已入账百分比、预计百分比、按已入账还差多少、按预测还差多少、约还差几班。

### 3.3 年度复盘

- 纯函数 `buildAnnualSummary` / `buildAnnualDays` / `buildYearHeatmap` / `buildAnnualReportText`。
- 热力图固定 12 行 × 31 列，按当月天数补 `null`；颜色按全年单日最高收入分 4 档。
- 年度报告是纯文本，走与工资条一致的 `exportFile`（Android 分享 / 网页下载）。

### 3.4 数据与备份

- 新键：`shift-ledger.records.v2`、`templates.v2`、`preferences.v2`、`plans.v2`、`plan-history.v2`、`settlements.v2`、`active-shift.v2`、`meta.v2`。
- 首次读取任一集合时执行幂等迁移：只补缺失的 v2 键，不覆盖已有 v2 数据；旧 v1 键只读保留。
- 备份 `version: 2`，包含应用版本和提醒设置；导入同时接受 `version: 1` / `version: 2`，输出统一为 v2 结构。
- 进行中的打卡在结束时同时清理 v1 / v2 临时键，避免旧键把已放弃的计时读回来。

## 4. 验收清单

- [x] `npm run typecheck`（strict）通过
- [x] `npm run lint` 0 warning / 0 error
- [x] `npm test` 91 个测试全部通过
- [x] `npm run build` 生成 `dist/`
- [x] `npx cap sync android` 成功
- [x] Gradle `assembleRelease` 使用原 keystore 生成签名 APK
- [x] `release/工时账本-2.0.0.apk` 与 `release/GongshiLedger-v2.0.0.apk`
- [x] Android `versionCode = 12`、`versionName = 2.0.0`
- [x] 首页、统计月报、年度复盘、加班表单在 430 × 932 视口完成截图检查
- [x] 1.x → 2.0 迁移、v1 备份导入、v2 备份往返有自动化测试

## 5. 交付物

- 源码：`src/pay.ts`、`src/forecast.ts`、`src/annual.ts`、`src/components/ForecastCard.tsx`、`src/components/YearReview.tsx` 及对应测试
- 文档：`README.md`、`CHANGELOG.md`、本文件
- 安装包：`release/工时账本-2.0.0.apk`、`release/GongshiLedger-v2.0.0.apk`
- 发布签名继续使用 `android/keystore/shift-ledger.jks`，后续版本必须沿用同一签名覆盖安装

## 6. 风险与回退

- **迁移风险**：v1 键保留只读；迁移失败时应用仍会回退读取旧键，不会白屏；写入失败沿用 1.9 的提示条方案。
- **金额口径变化**：只有显式开启加班规则的记录才分段，其余记录金额与 1.x 一致；测试覆盖无规则、短班、跨午夜、倍数冲突和舍入。
- **回退**：如需回退到 1.9，旧版仍能读到保留的 v1 键，但 2.0 新写入的数据不会出现在旧版中；发布前建议导出 v2 备份。
