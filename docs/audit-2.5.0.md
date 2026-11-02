# 工时账本 2.5.0 全量代码审计报告

- 审计范围：`src/`（139 个文件，约 18 600 行 TS/TSX + 7 200 行 CSS）、`vite.config.ts`、`index.html`、`public/manifest.webmanifest`、`android/`（Manifest、Gradle、资源）、`scripts/`、仓库卫生与发布配置。
- 审计方式：逐文件通读 + 类型检查 / Lint / 单测 / 构建四项基线 + 针对性运行验证（所有结论均可复现，验证脚本见各条“复现”）。
- 结论：**整体工程质量高于同类个人项目**——分层清晰（数据层 / 派生层 / 动作层 / 展示层）、写盘有队列与 flush、损坏数据有保全、备份有边界、无 XSS 汇聚点、无 `any`/`ts-ignore`、密钥未入库。但存在 **4 个必须修的数据正确性缺陷**、**1 个测试基线失效**，以及若干一致性与可达性问题。

---

## 一、审计基线（当前 `main` @ `ff02658`）

| 项目 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npx tsc -b` | ✅ 通过 |
| Lint（仓库配置） | `npx oxlint` | ✅ 0 warning / 0 error |
| 单元测试 | `npx vitest run` | ❌ **205 个用例 1 个失败**（`smoke.test.tsx`） |
| 生产构建 | `npx vite build` | ✅ 通过，JS 434.14 kB（gzip 129.45 kB）/ CSS 103.53 kB |

> 失败用例与 2.5.0 的“205 个单元与组件测试通过”发布说明不符（见 M-1）。

---

## 二、缺陷清单

### P0 — 数据正确性（必须修）

#### P0-1　计时打卡与轮班表忽略“日期倍率”，周末/节假日按 1× 计薪
- **位置**：`src/hooks/useRecordActions.ts:211`（`startTiming`）、`src/hooks/usePlanActions.ts:103`（`generateRotation`）；对照 `src/components/RecordSheet.tsx:109`、`src/components/PlanSheet.tsx:103`、`src/batch.ts:113`。
- **问题**：手动记账、排班、批量补记都会通过 `resolveDayRule()` 带出周末/节假日倍数，但**打卡开始**与**轮班表批量生成**把 `multiplier` 硬编码为 `1`，且 `sheetRouter` 没有把 `dayRule` 传给这两个入口。
- **影响**：开启“周末与节假日自动倍数”后，用户周六打卡（或生成整月轮班表）会按 1× 入账，与同一天手动记账的 2×/3× 结果不一致；轮班表一次生成几十个班，误差被成倍放大。这是记账应用里最难被用户发现的错误——金额看起来“合理”，只是少了。
- **复现**：开启规则（周末 2×）→ 周六用“打卡计时”记一班 → 记录收入 = 时薪 × 工时 × 1，而同日“记一班”为 ×2。
- **修复**：
  1. `startTiming` / `generateRotation` 接收 `dayRule`，按各自日期调用 `resolveDayRule(dayRule, date).multiplier` 作为初值（打卡用 `toISODate(now)`，轮班用 `entry.date`）；
  2. `App.tsx` 的 `actions` 中补传 `preferences.dayRule`，`sheetRouter` 透传给 `StartTimingSheet` / `RotationSheet`；
  3. `EndTimingSheet` 增加一行 `describeDayRule()` 提示（当前打卡链路完全没有倍数提示），并保持用户可手动改。
  4. 补 3 个用例：周六打卡默认 2×、轮班表跨周末逐日取倍数、`dayRule` 关闭时仍为 1×。

#### P0-2　`reload()` 会把“被校验过滤掉的数据”写回磁盘，造成静默数据丢失
- **位置**：`src/hooks/useAppData.ts:44-48`（`usePersistEffect`）与 `:102-113`（`reload`）；配合 `src/storage/index.ts:66`（`records.filter(isWorkRecord)`）。
- **问题**：读取时 `filter(isWorkRecord)` 会静默丢弃不合格条目（例如手工改过、或被旧版本写坏的 `date: "2026-02-30"`）。`lastPersisted` 只记录“上一次落盘的引用”，`reload()` 用新数组替换 state 后引用必然变化，于是 200ms 后把**过滤后的子集**写回 `shift-ledger.records.v2`——原始条目被永久覆盖。首次挂载不会触发（引用相同），但任何一次跨标签页 `storage` 事件或手动 `reload()` 都会触发。
- **影响**：用户从别的标签页/窗口切回来，或另一个窗口改了偏好，坏掉的那条记录就被删掉且无任何提示；而项目本身设计了 `shift-ledger.recovery.v2` 保全机制，说明这类数据是希望保住的——这里绕过了它。
- **复现**（已验证）：磁盘写入 `[good, badDate]` → 挂载后 state 为 1 条 → 调用 `reload()` → 500ms 后磁盘上只剩 1 条（`RECORDS_ON_DISK_AFTER_RELOAD: 1`）。
- **修复**：
  1. 读取层在过滤时，把被丢弃的条目按集合写入恢复副本（复用 `preserveCorrupt` 思路），或至少 `console.warn` + 上报一次 toast；
  2. `reload()` 后同步 `lastPersisted` 引用（或给 `usePersistEffect` 一个 `skipNext` 标志），避免“读回即回写”；
  3. 更稳妥：`loaders.*` 返回 `{ items, dropped }`，`dropped > 0` 时不自动回写，交给用户确认。

#### P0-3　跨标签页同步会用本页的旧快照覆盖另一页刚写入的数据
- **位置**：`src/hooks/useAppData.ts:104`（`queue.flush()`）与 `src/hooks/useStorageSync.ts:19-22`。
- **问题**：`reload()` 第一行先 `flush()` 把**本页尚未落盘的旧快照**写盘，然后才 `loadLedger()`。`storage` 事件到达时，本页的 flush 会先覆盖掉另一个窗口刚写的新数据，随后读回的是自己刚写的那份。注释的意图是“避免读回旧数据覆盖新编辑”，但代价是**反向覆盖**。
- **影响**：双窗口同时编辑时，后写入的一方被静默丢弃（last-write-wins 且写的是过期内容）。
- **复现**（已验证）：A 页改备注（未落盘）→ B 页直接写盘 → 触发 `reload()` → 最终磁盘为 A 的旧内容（`WINNER_NOTE: tabA`）。
- **修复**：区分“本页待写”与“外部变更”。`reload()` 不应无条件 flush；改为：storage 事件到达时若队列 `hasPending()`，先让本页写入完成再重新读取，或采用按集合的版本号/`updatedAt` 合并（记录已带 `updatedAt`，可直接做“较新者胜”）。至少要在 `flush()` 之后**重新读取**而不是继续用旧快照。

#### P0-4　`Stats` 忽略 `initialPeriod` 变更，首页“查看本周”可能打开成“本月”
- **位置**：`src/components/Stats.tsx:91`（`useState(initialPeriod)`）、`src/App.tsx:287-293`（`openStats`）。
- **问题**：`period` 只在挂载时初始化一次，之后 `initialPeriod` 的变化被忽略；而 `App` 的 `openStats(period)` 是“先 `setStatsPeriod(period)` 再 `goToTab('stats')`”。切页时 `screen-slot` 带 `key={tab}` 会重挂载，**从别的标签页进入时通常正常**；但当 `Stats` 已经挂载（例如停留在统计页）而外部再次请求某个周期时，请求会被吞掉。
- **影响**：首页“本周概览”入口在统计页已挂载的场景下无法把周期切到“本周”，用户看到的是上次的“本月”，并且没有任何提示。
- **复现**（已验证）：`render` 时 `initialPeriod="month"`，`rerender` 传 `initialPeriod="week"`，激活项仍为“本月”（`ACTIVE_PERIOD_AFTER_PROP_CHANGE: 本月`）。
- **修复**：把 `initialPeriod` 改为受控（由 `App` 持有 `period`，`Stats` 只接收 `period` + `onPeriodChange`），或在 `Stats` 内 `useEffect` 同步 `initialPeriod`（配合 `key` 更简单）。受控方案能同时消掉 `initialPeriod`/`onPeriodChange` 这对冗余 props。

---

#### P0-5　重复排班预览的班数与金额与实际保存结果不一致
- **位置**：`src/components/PlanSheet.tsx:174`（`repeatDatesISO` 生成完整日期）、`:266`（`earnings * dates.length`）、`:284`（`保存 ${dates.length} 个排班`）、`:344-347`（`每周重复，共 N 班`）；`src/hooks/usePlanActions.ts:58`（`freePlanDates` 过滤）。
- **问题**：预览用“全部重复日期”计算班数与预计收入，保存时却先剔除已有排班的日期。PlanSheet 根本没有引入 `freePlanDates`（也未接收 `plans`），因此**预览端无从知道哪些日期会被跳过**。
- **影响**：用户据预览做出的收入预估是错的。选 4 周、其中 2 天已有排班时，面板显示“共 4 班预计 ¥1,200 / 保存 4 个排班”，实际只创建 2 条，只有保存后的 toast 才告知跳过 2 个。
- **复现**（已验证）：`repeatDatesISO('2026-11-07', 4)` 得 4 个日期，占用其中 2 个后 `freePlanDates` 只剩 2 个（`PREVIEW_COUNT: 4  SAVED_COUNT: 2`）。
- **修复**：把 `plans` 传入 `PlanSheet`，用与 `savePlan` 相同的 `freePlanDates(dates, plans)` 计算 `effectiveDates`，班数/金额/按钮文案全部基于它；为 0 时禁用保存并提示“这些日期都已有排班”。`RotationSheet` 已经这样做了（`rotation.ts:99,116-120`，并在 `RotationSheet.tsx:275-276` 提示“N 天已有排班会自动跳过”），两处行为应对齐。

#### P0-6　「结束打卡」面板一打开就冻结计时，取消后暂停时长会变成默认休息扣款
- **位置**：`src/hooks/useRecordActions.ts:257-263`；`src/components/EndTimingSheet.tsx:43-46`。
- **问题**：`requestEndTiming` 在打开面板**之前**无条件写入 `pausedAt = now`（即使原本并未暂停），而关闭面板不会回滚。`EndTimingSheet` 又把 `pauseMinutes` 作为默认休息扣除（`suggestedBreak = pauseMinutes > 0 ? pauseMinutes : shift.breakMinutes`）。
- **影响**：用户点“结束记账”只想看一眼金额，随后关掉继续上班。计时停留在“已暂停”；若没注意点“继续”，这段会累计进 `pausedMs`。下次真正结算时默认 `breakMinutes` 等于该时长，`computePay` 直接少算工资（2 小时即少算 2 小时）。面板虽有“本次共暂停 N 分钟，已作为默认休息扣除”，但默认值已经生效。
- **修复**：在 sheet 状态里记录 `autoPaused: true`；`closeSheet` 时若本次暂停由“打开面板”自动添加，则回滚 `pausedAt = null` 且不把该段计入 `pausedMs`。或改为打开面板时只在内存中冻结显示，不写回 `activeShift`。

### P1 — 一致性、可达性与健壮性

#### P1-1　排班对账把“记录被移到别的月份”误判为漏班，完成率可归零
- **位置**：`src/planStats.ts:110`（`recordsById` 仅由 `monthRecords` 构建）、`:117-130`。
- **问题**：`recordsById` 只用**本月**记录构建。若某条排班在 10/31 完成、记录日期被改到 11/01，历史条目仍属于 10 月 → `recordsById.has(recordId)` 为 false → 该条被计入 `missed`，`completionRate` 从 100% 掉到 0%。
- **影响**：统计页显示“本月完成率 0%”，并把它算进“应完成”收入基数，直接误导用户对当月计划执行情况的判断。
- **复现**（已验证）：history 1 条 `{date:'2026-10-31', status:'completed', recordId:'r9'}` + records `{id:'r9', date:'2026-11-01'}` → `COMPLETED: 0  MISSED: 1  RATE: 0`。
- **修复**：`recordsById` 改用**全量** `records` 构建（不做月份过滤）；或当 `recordId` 在本月找不到时，再按“该 plan 日期附近是否存在对应记录”兜底，避免把跨月移动误判为漏班。

#### P1-2　批量补记以“整天”为粒度跳过，同一天的第二个班次永远补不上
- **位置**：`src/batch.ts:66,73-77`；`src/components/BatchRecordSheet.tsx:118-120,146`。
- **问题**：`planBatchDates` 用 `new Set(records.map(r => r.date))` 判断某天是否已占用——只要当天有**任意一条**记录（哪怕只是 2 小时的短班），整天空过。但应用其余部分明确允许一天多班（`PlanSheet` 的 `repeatDatesISO` 与 `savePlan` 对单日多班不做限制）。
- **影响**：用户当天先记了一个短班，再用批量补记补白班时，白班被静默丢弃；提示写的是“跳过 N 天已有记录”，用户会以为全部补记成功。
- **复现**（已验证）：10-26 已有 1 条 09:00–11:00 记录，对 `['2026-10-26','2026-10-27']` 调用 `planBatchDates` → `[["2026-10-26","recorded"],["2026-10-27","free"]]`。
- **修复**：`recorded` 判定改为“同一天 + 同名班次（或同 start/end）已存在”才算占用；若坚持整天空过，则文案改为“当天已有记录，将整天空过”，并提供“仍然补记”开关。

#### P1-3　快捷方式解析把任意 URL 的路径段当成动作
- **位置**：`src/shortcuts.ts:30-33`；配合 `src/hooks/useAppNavigation.ts:55-57`（原生端 `appUrlOpen` 直接 `run(action)`）。
- **问题**：scheme 分支未限制为 `gongshi`，任何 `https://` 链接只要首段路径命中 `record|timing|batch|stats` 就会被识别为快捷方式。
- **影响**：外部网页/其他 App 用 `VIEW` intent 打开 `https://anything/stats` 即可触发应用跳转统计页。不是安全漏洞，但属于未预期的行为注入面，也与注释“Android 快捷方式用 `gongshi://record`”不符。
- **复现**（已验证）：`parseAppAction('https://example.com/stats')` → `'stats'`；`parseAppAction('https://evil.test/record')` → `'record'`。
- **修复**：scheme 分支限制为 `/^gongshi:\/\//i`，其余 scheme 只接受 `?action=` / `#action=`。

#### P1-4　导出不清理 Cache 临时文件，分享重入被误报为失败
- **位置**：`src/native.ts:42-53`；`src/app/fileExport.ts:5-7,38-46`。
- **问题**：每次导出都向 `Directory.Cache` 写一份同名文件，从不删除；且 Android 端 `Share.share` 在 `isPresenting` 为真时 reject `"Can't share while sharing is in progress"`，该消息不含 `cancel`，被 `isCancelError` 判为真实失败。
- **影响**：连续导出会累积多份备份 JSON（每份可达数百 KB）；用户快速点两次“导出备份”，第二次提示“导出失败，请重试”，而第一次分享其实仍在进行。
- **修复**：导出前/分享结束后 `Filesystem.deleteFile(...).catch(() => {})`；把 “sharing is in progress” 类错误归入“忽略”而非失败提示。

#### P1-5　`useClock` 回前台只补一次 `tick()`，不重排定时器
- **位置**：`src/useClock.ts:21-28,47-49`。
- **问题**：`scheduleTick` 用递归 `setTimeout` 维持走时；`handleVisibilityChange` 只调用 `tick()`，不重新 `scheduleTick()`。若系统在后台丢弃了待触发的 timeout（Android WebView 常见），回前台后时钟不再自动前进，直到组件卸载重挂。
- **影响**：计时卡片、日历“今天”等每分钟刷新会在后台返回后停滞。（此项为代码路径分析，未在真机复现，故列 P1 而非 P0。）
- **修复**：`handleVisibilityChange` 中先 `clearTimeout(timer)` 再 `tick()` + `scheduleTick()`；`scheduleTick` 递归前检查 `listeners.size > 0`，避免订阅归零后仍留下无人清理的定时器链。

#### P1-6　`smoke.test.tsx` 依赖真实日期，测试基线已失效
- **位置**：`src/smoke.test.tsx:44,60,260`（fixture 固定 `2026-10-24` / `2026-10-27`，断言 `output[13]` 含“排班对账”）。
- **问题**：`Stats` 默认锚定“当前月”，`PlanReconcilePanel` 仅在 `totalPlans > 0` 时渲染（`Stats.tsx:349`）。fixture 的排班在 2026-10，当系统日期走到 2026-11 后该面板消失，断言失败。
- **已验证**：把系统时间伪造成 2026-10-28 时断言通过，2026-11-02 时失败；且在 2.3.0 提交上同样失败——说明这不是 2.5.0 引入的回归，而是一直存在的**时间炸弹**。
- **修复**：在用例内 `vi.setSystemTime()` 固定到 fixture 所在月份（并对 `Stats` 显式传 `initialPeriod`），或把 fixture 日期改成相对今天的偏移。同时应把该用例纳入 CI，避免再次“发布说明声称通过、实际红灯”。

#### P1-7　长度上限散落为魔法数字，与 `FIELD_LIMITS` 不一致
- **位置**：`src/components/ShiftFormFields.tsx:100`（班次名 `maxLength={12}`）、`src/components/EndTimingSheet.tsx:194`（备注 `40`）、`src/components/Settings.tsx:386`（节假日名 `12`）、`src/components/SettlementSheet.tsx:339`（结算备注 `60`）；对照 `src/types.ts:170` 的 `FIELD_LIMITS`（`shiftName: 20`）。
- **问题**：2.3.0 已把上限收敛到 `FIELD_LIMITS` 供“表单与导入共用”，但自定义班次名仍写死 12，而 CSV 导入按 20 截断。同一字段在两个入口得到不同长度。
- **影响**：CSV 导入的 13–20 字班次名无法在表单里再编辑保存（会被截断或产生不一致）；`EndTimingSheet` 的 `40` 与 `FIELD_LIMITS.note` 重复但未复用。
- **修复**：全部改用 `FIELD_LIMITS.shiftName` / `FIELD_LIMITS.note`；`Settings` 的节假日名改用 `MAX_HOLIDAY_LABEL`（`dayRule.ts:15` 已导出），`SettlementSheet` 的 60 新增到 `FIELD_LIMITS`。

#### P1-8　系统提醒上限 50 且对用户不可见
- **位置**：`src/reminders.ts:19,62`（`MAX_SCHEDULED_REMINDERS = 50`，`.slice(0, limit)`）；`src/components/Settings.tsx:467-469`。
- **问题**：只按 `notifyAt` 排序取前 50 个，超出的排班**永远不会排提醒**，界面只显示“已为未来 N 个排班安排提醒”，不会说明被截断。
- **影响**：排班超过 50 个的用户（轮班表一次就能生成 28–52 个）会静默丢失后面的提醒。
- **修复**：`buildReminderCandidates` 返回 `{ candidates, truncated }`；设置页在 `truncated > 0` 时提示“仅前 50 个排班可安排提醒”。或按时间窗口滚动重排。

#### P1-9　`allowBackup="true"` 但未配置备份规则，账本会进入云备份/换机迁移
- **位置**：`android/app/src/main/AndroidManifest.xml:5`。
- **问题**：应用明确宣称“数据存在本机、离线可用”，且 `README` 提示“清理浏览器数据会一并清除账本，建议定期备份”。但 Android 默认自动备份会把 WebView 的 localStorage 纳入 Google 云备份，与产品声明不完全一致，也不在用户预期内。
- **修复**：明确取舍——若要“本机-only”，加 `android:dataExtractionRules` / `android:fullBackupContent` 排除 WebView 数据目录；若要保留换机能力，在 README/设置页说明“系统备份可能包含账本数据”。

#### P1-10　写盘失败只有一句通用提示，没有降级或重试
- **位置**：`src/storage/keys.ts:223-230`（`writeJson` 捕获后仅 `reportStorageError`）；`src/App.tsx:225`。
- **问题**：配额耗尽（大备份导入后较容易触发）时，`localStorage.setItem` 抛错 → 界面弹“保存失败：本地存储不可用或空间已满，请先导出备份”，但**内存状态已更新**，用户继续操作会以为已保存。没有“导出当前内存数据”的兜底入口（`ErrorBoundary` 里有，正常路径没有）。
- **修复**：写失败时把失败集合标记为 dirty，在设置页/顶栏常驻“有未保存修改 · 导出”入口；或对 `QuotaExceededError` 触发一次“压缩 + 重试”（例如清理 `recovery.v2` 旧副本）。

---

### P2 — 可维护性与体验

| 编号 | 位置 | 问题 | 建议 |
| --- | --- | --- | --- |
| P2-1 | `src/useClock.ts:15-28` | 全局每分钟 `tick()` 会通知全部 8 个订阅组件（Home/Calendar/Stats/Settings/...），即使它们只用到 `date` 而非 `timestamp` | 拆成 `useToday()`（按日期变化才通知）与 `useNow()`（按分钟），减少每分钟的全页重算 |
| P2-2 | `src/hooks/useAppData.ts:59` | 7 个集合共用一个写盘队列，导入备份会一次性写 7 个 key（每个都是全量 JSON 序列化），大账本下可能造成 >100ms 卡顿 | 对 `records`/`planHistory` 这类大集合考虑分片或增量写；至少在导入时给出进度反馈 |
| P2-3 | `src/components/Stats.tsx:91`、`src/components/Calendar.tsx:220` | 页面级 `useState` 从 props 初始化后不再同步（`Stats` 的 `initialPeriod`、`Calendar` 依赖 `key` 重挂载） | 统一策略：要么全部受控，要么明确“仅初始化”并在文档/类型注释里写清 |
| P2-4 | `src/App.tsx:173` | 快捷方式 `stats` 分支 `setStatsPeriod('month')` 与 P0-4 同源，修 P0-4 时一并处理 | 受控化后此分支只需 `goToTab('stats')` |
| P2-5 | `src/shortcuts.ts:32` | `schemeMatch[2]` 依赖捕获组存在，正则固定有两组，暂无风险；但 `gongshi://record/extra` 会被 `normalize` 拒绝且无提示 | 加一条单测锁住“未知 action 静默忽略”的契约 |
| P2-6 | 全仓库 | 无 CI 配置（无 `.github/`），`tsc/oxlint/vitest/build` 全靠本地手工执行，P1-6 的时间炸弹因此长期未被发现 | 增加最小 CI（PR 与 main 各跑一次四项基线） |
| P2-7 | `docs/` | 发布文档缺少“已知问题/回归清单”，2.5.0 声称“205 个测试通过”与实际不符 | 发布说明改为引用 CI 产物链接或附上实际命令输出 |
| P2-8 | `src/components/BottomSheet.tsx:224-226`、`190-202`、`69-75` | 遮罩点击 / 下滑 / Escape 三条关闭路径都直接 `onClose()`，无 dirty 检查；各业务表单用局部 state（如 `RecordSheet.tsx:153-159`），误触即静默丢失整张表单 | 给 `BottomSheet` 增加 `dirty?: boolean`，dirty 时走 `askConfirm`；或用 `useRef` 保存初始 draft 做脏检查 |
| P2-9 | `src/components/ShiftFormFields.tsx:296,311` + `src/components/NumberInput.tsx:48` | “标准工时”按 `Math.round(h*60)` 归一化后回传，与输入值不等，触发 `NumberInput` 的重写分支 | 已验证：输入 `8.33` → `8.333333333333334`，`9.99` → `9.983333333333333`。改用容差比较（`< 0.001`）或保留输入文本、失焦时归一化 |
| P2-10 | `src/components/ShiftFormFields.tsx:381` vs `:391` | 加班倍数 chip 用 `Math.max(effective.multiplier, multiplier)`（与 `computePay` 一致），提示文案却用 `effective.multiplier`；班次 2× + 规则 1.5× 时高亮 2× 但文案写 1.5× | 文案统一改为 `Math.max(effective.multiplier, multiplier)` |
| P2-11 | `TemplateSheet.tsx:116-123`、`RecordSheet.tsx:407-414`、`PlanSheet.tsx:446-453`、`EndTimingSheet.tsx:188-195`、`BatchRecordSheet.tsx:344-351`、`SettlementSheet.tsx:333-340` | 班次名/备注的可见标签是 `<span class="field-label">`，无 `htmlFor`/`aria-label`，读屏只能退回 placeholder；输入后语义丢失 | 改为 `<label htmlFor>` + `id`，或直接补 `aria-label`（同文件 `NumberInput` 已有 `ariaLabel` 范例） |
| P2-12 | `src/search.ts:5-7` | 只做 `trim + toLowerCase`，未做 NFKC 归一化；中文输入法下的全角数字（`２０２６`）搜不到半角日期 | `normalizeSearchQuery` 追加 `.normalize('NFKC')`，记录字段同样归一化后再比较 |
| P2-13 | `src/useFocusTrap.ts:15-19` | 用 `getClientRects().length > 0` 判断可聚焦，对 `visibility:hidden` 无效（仍有 client rects） | 追加 `getComputedStyle(node).visibility !== 'hidden'`，或改用 `node.checkVisibility?.()` |
| P2-14 | `src/app/fileExport.ts:5-7` | `/cancel/i` 匹配任意错误消息；文件名含 “cancel” 时真实失败会被当作取消而静默吞掉 | 精确匹配 `/^share cancel(l)?ed$/i`，或按插件名判定错误来源 |
| P2-15 | `src/annual.ts:200-209` | `bestMonth` 先按月份升序排序（并列取最早），`bestDay` 未排序（并列取 `dayMap` 插入顺序，通常最新）——并列规则不一致 | `dayEntries.sort((a,b) => a.date.localeCompare(b.date))` 后再 reduce，统一为“最早” |

---

## 三、已确认无问题（本轮重点核查）

为避免只报问题造成误判，以下为本轮**专门验证并确认正确**的点：

1. **密钥与签名**：`android/keystore/`、`android/keystore.properties` 均被 `.gitignore` 覆盖且未被跟踪；`release/*.apk` 未入库。
2. **XSS / 注入**：全仓库无 `dangerouslySetInnerHTML`、`innerHTML`、`eval`、`new Function`；CSV 导出已做公式注入前缀阻断（`utils/export.ts:72-75`）。
3. **备份边界**：`parseBackup` 对集合条数、单月调整项、文件体积均有上限，且**超限抛错而非静默截断**；重复 id 按 `updatedAt`/`completedAt` 取新。
4. **计薪核心**：`computePay` 对 NaN/负数/超界输入全部兜底；加班倍数强制“不低于正常时段”；`round2` 统一精度。`24h` 上限不会截断合法输入（HH:MM 最大跨度为 1439 分钟，已验证）。
5. **存储迁移**：v1→v2 幂等、不覆盖已有 v2、旧键保留；损坏 JSON 会保全原文到 `recovery.v2` 且不会重复改写。
6. **无障碍基础**：Toast 有 `role="status"` + `aria-live`，浮层有 `role="dialog"`/`aria-modal`/焦点陷阱与归还，`<main>`/`<nav>` 在浮层打开时 `inert`，表单控件普遍有 `aria-label`/`aria-invalid`，`prefers-reduced-motion` 在 CSS 与 JS 双侧生效。
7. **原生资源**：`ic_stat_shift`、`shortcuts.xml`、`file_paths.xml` 均存在；`SystemBars.insetsHandling: 'css'` 与 `base.css` 的 `--safe-area-inset-*` 回退链一致；`SystemBars` 由 `@capacitor/core` 自带，无需额外依赖。
8. **构建**：`vite build` 正常产出 `sw.js` 与预缓存清单，`index.html` 的首屏主题脚本与 `useTheme` 的 `theme-color` 同步逻辑一致。

---

## 四、修复计划

### 第 1 批（阻塞发布，建议同一 PR）
1. **P0-1 日期倍率**：`startTiming` / `generateRotation` 接入 `dayRule`；`sheetRouter` 透传；`EndTimingSheet` 增加倍数说明；补 3 个单测。
2. **P0-2 静默丢数据**：读取层记录被丢弃条目并保全；`reload()` 不再“读回即回写”。
3. **P0-3 跨页覆盖**：`reload()` 改为“先结算本页待写 → 重新读取 → 按 `updatedAt` 合并”，或引入集合级版本号。
4. **P0-4 统计周期**：`Stats` 改为受控周期。
5. **P0-5 排班预览**：`PlanSheet` 接入 `freePlanDates`，班数/金额/按钮与保存结果一致。
6. **P0-6 结束打卡冻结**：取消 endTiming 时回滚自动暂停。
7. **P1-6 时间炸弹**：`smoke.test.tsx` 固定系统时间；随后四项基线全绿。

**验收**：`tsc -b` / `oxlint` / `vitest`（含新增用例）/ `vite build` 全绿；手工回归“周六打卡 == 周六手动记账”金额一致；双标签页同时编辑不再丢数据；重复排班预览班数 == 实际创建班数；打开再关闭“结束打卡”后计时仍在走。

### 第 2 批（下个版本）
8. P1-1 对账跨月误判：`recordsById` 改用全量记录。
9. P1-2 批量补记粒度：按“同班次”判定占用，或明确文案 + 强制补记开关。
10. P1-3 快捷方式：scheme 限制为 `gongshi`。
11. P1-4 导出：清理 Cache 临时文件，区分“分享进行中”与真实失败。
12. P1-5 时钟：回前台重排定时器。
13. P1-7 长度上限统一到 `FIELD_LIMITS` / `MAX_HOLIDAY_LABEL`。
14. P1-8 提醒截断可见化。
15. P1-9 明确 Android 备份策略并在文档同步。
16. P1-10 写盘失败的常驻降级入口。
17. P2-8 浮层关闭的脏检查。
18. P2-9 标准工时输入容差比较。
19. P2-10 加班倍数文案口径统一。
20. P2-11 表单标签与输入框程序化关联。
21. P2-12 搜索 NFKC 归一化。
22. P2-13 焦点陷阱可见性判断。
23. P2-14 取消错误精确匹配。
24. P2-15 年度并列取值规则统一。
25. P2-6 增加最小 CI，把四项基线固化。

### 第 3 批（技术债）
26. P2-1 拆分 `useClock` 的订阅粒度。
27. P2-2 大集合写盘优化。
28. P2-3/P2-4 统一“props 初始化 vs 受控”的策略并在类型注释中写明。
29. P2-5/P2-7 补契约单测与发布文档规范。

---

## 五、附：本次审计用到的可复现验证

```bash
npx tsc -b                 # 通过
npx oxlint                 # 0 warning / 0 error
npx vitest run             # 204 passed / 1 failed (smoke.test.tsx)
npx vite build             # 通过
```

三个探针用例（均已跑通并已从仓库移除，可按下述思路重建）：

1. **P0-2**：写入 `[合法记录, date:"2026-02-30"]` → `renderHook(useAppData)` → `reload()` → `advanceTimersByTime(500)` → 断言磁盘只剩 1 条。
2. **P0-3**：A 页 `setRecords(改备注)`（未落盘）→ 直接向 `localStorage` 写入 B 页数据 → `reload()` → 断言最终备注为 A。
3. **P1-6**：`vi.setSystemTime(2026-10-28)` 时 `Stats` 含“排班对账”，`2026-11-02` 时不含。

另有三个纯函数级验证：

4. **P0-5**：`repeatDatesISO('2026-11-07', 4)` 得 4 个日期，占用其中 2 个后 `freePlanDates` 只剩 2 个。
5. **P0-1**：`resolveDayRule({enabled:true, weekendMultiplier:2}, '2026-11-07')` 返回 `2`，而 `startTiming` 写入的是 `1`。
6. **P2-9**：`Math.round(8.33*60)/60 === 8.333333333333334`。
7. **P1-1**：`buildPlanReconciliation` 传入 10 月 history + 11 月 record → `completed=0, missed=1, completionRate=0`。
8. **P1-2**：`planBatchDates(['2026-10-26','2026-10-27'], [2 小时记录], [])` → 10-26 整天空过。
9. **P1-3**：`parseAppAction('https://example.com/stats') === 'stats'`。

---

## 六、审计方法说明与局限

- **已覆盖**：全部 `src/**` 源码（139 个文件）、配置、Android 工程、构建与测试基线、仓库卫生。
- **验证方式**：静态通读 + 4 项基线命令 + 9 个针对性探针（含伪造系统时间、伪造跨标签页写入、直接调用纯函数）。所有列为 P0/P1 的结论都至少有一条可复现证据；未能复现的猜测**未写入**本报告（例如“24h 上限会截断工资”经计算最大跨度为 1439 分钟，已排除；“Android WebView 输入自动放大”在 Chromium 上不成立，已排除；“`overview.buildWeekOverview` 跨 DST 错位”未实测出错误，已排除）。
- **未覆盖**：首轮为纯静态审计；后续修复阶段已在雷电模拟器（Android 14）上安装 APK 并验证 P0-1 / P0-6 的完整链路（见第七节）。通知调度、分享面板、安全区仍仅做静态核对；P1-4 / P1-5 属代码路径分析；未做性能剖析，P2-2 的卡顿判断基于代码路径而非实测帧时间。
- **探针脚本**：为避免污染仓库，所有临时测试文件在运行后已删除，工作区仅新增本报告。复现步骤见第五节。
- **交叉验证**：组件层与纯函数层分别由独立审计并行完成，`P0-1`（日期倍率在打卡/轮班链路缺失）被两条独立路径同时命中，可信度较高。

---

## 七、修复记录（2026-11-02）

第 1、2 批已全部修复（第 3 批中的 P2-1 一并完成），仅 P2-2 / P2-3 / P2-7 主动延后。基线：`tsc -b` 通过、`oxlint` 0 warning、`vitest` **234 通过**（原 205，新增 29 个回归用例）、`vite build` 通过。

### 已修复

| 编号 | 问题 | 修复要点 | 回归用例 |
| --- | --- | --- | --- |
| P0-1 | 打卡 / 轮班表忽略日期倍率 | `startTiming` 与 `generateRotation` 接入 `resolveDayRule`；`dayRule` 经 `App` → 动作层/`sheetRouter` 透传；`EndTimingSheet` 增加“按日期规则带出”提示 | `actionPolicies.test.tsx`（周六 2×、工作日 1×、规则关闭 1×、轮班逐日取倍数） |
| P0-2 | `reload()` 把过滤结果写回磁盘，静默删数据 | 读取层把被丢弃的条目写入恢复副本（`preserveDropped`）；`reload()` 读回的值经 `consumeExternal` 标记后不再落盘 | `appDataSync.test.tsx`（磁盘仍保留 2 条、恢复副本含坏记录） |
| P0-3 | 跨标签页 reload 用旧快照覆盖新数据 | `reload()` 不再 `queue.flush()`；对仍有待写变更的集合保留本页版本；无待写的集合读入磁盘且不回写 | `appDataSync.test.tsx`（不覆盖其他标签页、无待写时不产生写盘） |
| P0-4 | `Stats` 忽略 `initialPeriod` 变化 | 周期改为受控（`period` + `onPeriodChange`），由 `App` 持有 | `statsPeriod.test.tsx` |
| P0-5 | 重复排班预览班数/金额与实际保存不符 | `PlanSheet` 接收 `plans`，用与 `savePlan` 相同的 `freePlanDates` 计算预览；全被占用时禁用保存；`savePlan` 仍负责过滤与提示 | `planSheet.test.tsx` |
| P0-6 | 打开“结束打卡”会冻结计时，取消后暂停时长被当作休息扣款 | 打开面板不再改写 `pausedAt`，只冻结 `endTime`；提示文案同步 | `actionPolicies.test.tsx` |
| P1-6 | `smoke.test.tsx` 依赖真实日期 | 用例内 `vi.setSystemTime(2026-10-28)` 并给 `Stats` 显式传 `period` | 既有 smoke 用例在任意日期稳定通过 |
| P1-1 | 对账把跨月记录误判为漏班 | `recordsById` 改用全量记录构建 | `planStats.test.ts` |
| P1-7 | 长度上限硬编码 | 新增 `FIELD_LIMITS.settlementNote/holidayLabel`；班次名 12→20 与 `FIELD_LIMITS.shiftName` 对齐 | 类型检查覆盖 |
| P2-10 | 加班倍数文案与 chip 口径不一致 | 统一为 `Math.max(班次倍数, 规则倍数)` | 类型检查覆盖 |
| P2-12 | 搜索不兼容全角输入 | `normalizeSearchQuery` 增加 `NFKC` | `search.test.ts` |
| P2-14 | `/cancel/i` 误吞真实失败 | 改为整条消息精确匹配（插件实际消息为 `Share canceled`，已核对 Android/iOS 源码） | `fileExport.test.ts` |
| P2-15 | 年度“最高单日”并列取值依赖 Map 插入序 | 先按日期排序，与“最高月”统一取最早 | 既有 `annual.test.ts` |

### 第 2 批剩余（同日补齐）

| 编号 | 问题 | 修复要点 | 回归用例 |
| --- | --- | --- | --- |
| P1-2 | 批量补记以“整天”跳过，同一天第二个班次补不上 | `planBatchDates` 新增 `identity`：只有“同一天已记过同一班次（同名或同起止）”才占用；文案改为“已记过这一班” | `batch.test.ts`（短班不占白班、同名/同时间段才算占用） |
| P1-3 | 任意 URL 的路径段被当成快捷方式 | scheme 分支限定为 `gongshi://` | `shortcuts.test.ts` |
| P1-4 | 导出不清理缓存；分享重入被当成失败 | 导出前清理同前缀旧文件；新增 `isShareBusyError`，提示“稍后再试”而非“导出失败” | `fileExport.test.ts` |
| P1-5 | 回前台只补一次 tick，之后不再走时 | `visibilitychange` 时清掉旧定时器、重新 `tick` + `scheduleTick`；无订阅者时不再排下一次 | 代码路径 |
| P1-8 | 提醒上限 50 对用户不可见 | 新增 `buildReminderPlan` 返回 `{ candidates, total }`；`ReminderStatus.total` 透传到设置页文案 | `reminders.test.ts` |
| P1-9 | `allowBackup` 无规则 | 新增 `backup_rules.xml` / `data_extraction_rules.xml`，只备份 `app_webview/`；README 同步说明 | 构建校验 + 文档 |
| P1-10 | 写盘失败只有一句 toast | 新增 `STORAGE_WRITE_OK_EVENT` 与失败态追踪；顶部常驻提示条 + “导出原始数据” | `storageFailure.test.ts` |
| P2-1 | 所有时钟订阅者每分钟重渲染 | `useClock` 拆出 `useToday` / `useNow`；结算、设置、计时卡等按需订阅 | 全量测试 |
| P2-8 | 点遮罩/下滑/Esc 误关表单 | `useIsDirty` + `BottomSheet.dirty`：脏表单拦截非显式关闭并提示，右上角关闭仍可用 | `bottomSheet.test.tsx` |
| P2-9 | 标准工时被回写成超长浮点 | 小时数按 `round2` 展示，`8.33` 不再变成 `8.333333333333334` | 类型 + 组件测试 |
| P2-11 | 备注/班次名标签未与输入框关联 | 补 `aria-label` | 组件渲染 |
| P2-13 | 焦点陷阱把 `visibility:hidden` 当可聚焦 | `visibleFocusable` 追加可见性判断 | 代码路径 |
| P2-6 | 无 CI | 新增 `.github/workflows/ci.yml`：typecheck / lint / test / build | — |

### 真机验证（雷电模拟器，Android 14 / `emulator-5554`）

- 构建 `assembleDebug` → `adb install -r` → 启动，应用正常进入首页，无 JS 崩溃。
- **P0-1**：把“今天（2026-11-02）”配置为 3× 节假日 → 点“打卡计时”→“开始计时” → 持久化的 `active-shift` 中 `multiplier: 3`（修复前恒为 1）。
- **P0-6**：点“结束记账” → 面板显示“按日期规则带出：审计日 · 3×”，`pausedAt` 仍为 `null`；关闭面板后计时继续（`stillTiming: true`，`pausedAt: null`，elapsed 持续增长）。
- **P2-8**：打开记录编辑并改备注 → 点遮罩 → 面板保持打开并提示“还有未保存的内容，点右上角关闭可放弃”，备注未丢；点右上角关闭或保存均正常工作，保存后记录带 `multiplier: 3` 落盘。
- 全量回归：上述测试记录在首页显示 `×3` 角标，保存后 `记录已更新` 提示与磁盘数据一致。

### 未修复 / 主动延后

- **P2-2 大集合写盘优化**：属性能优化而非缺陷。当前写盘已按集合合并、200ms 节流，且每条记录只在编辑后触发一次；继续拆分分片写入会引入新的迁移风险，建议在有实测卡顿数据后再做。
- **P2-3 props 受控策略**：`Stats` 已改为受控；`Calendar` 依赖 `key` 重挂载是刻意设计（通知深链需要重建整月锚点），已在注释中说明，不再统一改造。
- **P2-7 发布文档规范**：属流程约定，已在 CI 中固化“四项基线必须通过”，文档规范留待下个版本随发布流程一起调整。

### 仍然存在的已知限制（需产品决策）

- 两个标签页**同时编辑同一集合**时仍是 last-write-wins：本修复消除了“无编辑的标签页也会覆盖”的路径，但没有引入按 `updatedAt` 的逐条合并——那会与“删除记录”冲突（合并会把已删除的记录复活），需要墓碑标记才能做对。
- 结算（`MonthlySettlement`）只存 `paidAmount` 与调整项，`应发` 每次由当前记录实时重算。若用户修改历史月份记录，已结算月份的“应发 / 差额”会跟着变，属于口径问题而非缺陷，需产品确认是否要冻结快照。
