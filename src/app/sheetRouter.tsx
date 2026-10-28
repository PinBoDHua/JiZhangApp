import type { ComponentProps } from 'react';
import { BatchRecordSheet } from '../components/BatchRecordSheet';
import { EndTimingSheet } from '../components/EndTimingSheet';
import { GoalSheet } from '../components/GoalSheet';
import { MissedPlansSheet } from '../components/MissedPlansSheet';
import { PlanSheet } from '../components/PlanSheet';
import { RecordSheet } from '../components/RecordSheet';
import { RotationSheet } from '../components/RotationSheet';
import { SettlementSheet } from '../components/SettlementSheet';
import { StartTimingSheet } from '../components/StartTimingSheet';
import { TemplateSheet } from '../components/TemplateSheet';
import type { DayPayRule, PlannedShift, ShiftTemplate, WorkRecord } from '../types';
import { todayISO } from '../utils';
import type { SheetState } from './sheetState';

/**
 * 浮层路由：把 SheetState 的可辨识联合映射到具体组件。
 *
 * 抽出来的理由
 * - App 只负责「当前打开哪个浮层」，至于这个浮层长什么样、要哪些数据，是另一件事；
 * - 原来这段 switch 直接写在 App 的作用域里，可以随手引用任何局部变量，
 *   改动 App 时很难判断会不会影响浮层；现在依赖被收敛成显式的 data / actions；
 * - 新增一种浮层时只改两处（sheetState 加一个分支、这里加一个 case），
 *   不会再出现「忘了传某个回调」这类运行时才发现的问题。
 *
 * 类型全部用 ComponentProps 从组件本身取，避免在这里重复声明一份签名而漂移。
 */

type RecordSheetProps = ComponentProps<typeof RecordSheet>;
type PlanSheetProps = ComponentProps<typeof PlanSheet>;
type BatchRecordSheetProps = ComponentProps<typeof BatchRecordSheet>;
type RotationSheetProps = ComponentProps<typeof RotationSheet>;
type MissedPlansSheetProps = ComponentProps<typeof MissedPlansSheet>;
type TemplateSheetProps = ComponentProps<typeof TemplateSheet>;
type GoalSheetProps = ComponentProps<typeof GoalSheet>;
type StartTimingSheetProps = ComponentProps<typeof StartTimingSheet>;
type EndTimingSheetProps = ComponentProps<typeof EndTimingSheet>;
type SettlementSheetProps = ComponentProps<typeof SettlementSheet>;

export interface SheetData {
  templates: ShiftTemplate[];
  records: WorkRecord[];
  plans: PlannedShift[];
  /** 当前正在计时的排班 id：漏班列表据此避免把进行中的排班当成待补记 */
  activePlanId: string | null;
  /** 最近一条记录，用于新建记录时带出上次的班次设置 */
  latestRecord: WorkRecord | null;
  defaultTemplate: ShiftTemplate | null;
  dayRule?: DayPayRule;
  /** 月收入目标，目标浮层用它回填当前值 */
  monthlyGoal: number;
  reminder: {
    available: boolean;
    enabled: boolean;
    leadMinutes: number;
  };
}

export interface SheetActions {
  close: () => void;
  saveRecord: RecordSheetProps['onSave'];
  deleteRecord: NonNullable<RecordSheetProps['onDelete']>;
  savePlan: PlanSheetProps['onSave'];
  requestDeletePlan: NonNullable<PlanSheetProps['onDelete']>;
  generateBatch: BatchRecordSheetProps['onGenerate'];
  generateRotation: RotationSheetProps['onGenerate'];
  /** 从漏班列表跳到「记一班」 */
  recordPlan: (plan: PlannedShift) => void;
  skipPlan: MissedPlansSheetProps['onSkip'];
  saveTemplate: TemplateSheetProps['onSave'];
  requestDeleteTemplate: NonNullable<TemplateSheetProps['onDelete']>;
  saveGoal: GoalSheetProps['onSave'];
  startTiming: StartTimingSheetProps['onStart'];
  saveTimingEnd: EndTimingSheetProps['onSave'];
  saveSettlement: SettlementSheetProps['onSave'];
  sharePayslip: SettlementSheetProps['onShare'];
}

interface SheetRouterProps {
  sheet: SheetState;
  /** 确认框打开时禁用 Escape，避免一次按键同时关掉两层 */
  guard: boolean;
  data: SheetData;
  actions: SheetActions;
}

export function SheetRouter({ sheet, guard, data, actions }: SheetRouterProps) {
  switch (sheet.kind) {
    case 'record':
      return (
        <RecordSheet
          key={
            sheet.record?.id ??
            sheet.plan?.id ??
            `new-${sheet.template?.id ?? 'custom'}-${sheet.date ?? todayISO()}`
          }
          templates={data.templates}
          record={sheet.record}
          plan={sheet.plan}
          template={sheet.template}
          initialDate={sheet.date}
          recentRecord={sheet.record || sheet.plan ? undefined : data.latestRecord}
          dayRule={data.dayRule}
          onClose={actions.close}
          onSave={actions.saveRecord}
          onDelete={sheet.record ? actions.deleteRecord : undefined}
          escapeDisabled={guard}
        />
      );
    case 'plan':
      return (
        <PlanSheet
          key={sheet.plan?.id ?? `new-plan-${sheet.date ?? todayISO()}`}
          templates={data.templates}
          plan={sheet.plan}
          initialDate={sheet.date}
          defaultTemplate={data.defaultTemplate}
          dayRule={data.dayRule}
          reminderAvailable={data.reminder.available}
          globalReminderEnabled={data.reminder.enabled}
          globalReminderLeadMinutes={data.reminder.leadMinutes}
          onClose={actions.close}
          onSave={actions.savePlan}
          onDelete={sheet.plan ? actions.requestDeletePlan : undefined}
          escapeDisabled={guard}
        />
      );
    case 'batch':
      return (
        <BatchRecordSheet
          key={`batch-${sheet.date ?? todayISO()}`}
          templates={data.templates}
          records={data.records}
          plans={data.plans}
          defaultTemplate={data.defaultTemplate}
          initialDate={sheet.date}
          dayRule={data.dayRule}
          onClose={actions.close}
          onGenerate={actions.generateBatch}
          escapeDisabled={guard}
        />
      );
    case 'rotation':
      return (
        <RotationSheet
          key={`rotation-${sheet.date ?? todayISO()}`}
          templates={data.templates}
          plans={data.plans}
          initialDate={sheet.date}
          onClose={actions.close}
          onGenerate={actions.generateRotation}
          escapeDisabled={guard}
        />
      );
    case 'missed':
      return (
        <MissedPlansSheet
          plans={data.plans}
          records={data.records}
          activePlanId={data.activePlanId}
          onClose={actions.close}
          onRecord={actions.recordPlan}
          onSkip={actions.skipPlan}
          escapeDisabled={guard}
        />
      );
    case 'template':
      return (
        <TemplateSheet
          key={sheet.template?.id ?? 'new-template'}
          template={sheet.template}
          onClose={actions.close}
          onSave={actions.saveTemplate}
          onDelete={sheet.template ? actions.requestDeleteTemplate : undefined}
          escapeDisabled={guard}
        />
      );
    case 'goal':
      return (
        <GoalSheet
          goal={data.monthlyGoal}
          onClose={actions.close}
          onSave={actions.saveGoal}
          escapeDisabled={guard}
        />
      );
    case 'startTiming':
      return (
        <StartTimingSheet
          templates={data.templates}
          defaultTemplate={data.defaultTemplate}
          onClose={actions.close}
          onStart={actions.startTiming}
          escapeDisabled={guard}
        />
      );
    case 'endTiming':
      return (
        <EndTimingSheet
          shift={sheet.shift}
          endTime={sheet.endTime}
          endAt={sheet.endAt}
          onClose={actions.close}
          onSave={actions.saveTimingEnd}
          escapeDisabled={guard}
        />
      );
    case 'settlement':
      return (
        <SettlementSheet
          monthLabel={sheet.context.monthLabel}
          baseEarnings={sheet.context.baseEarnings}
          baseMinutes={sheet.context.baseMinutes}
          workedDays={sheet.context.workedDays}
          overtimeMinutes={sheet.context.overtimeMinutes}
          overtimeEarnings={sheet.context.overtimeEarnings}
          settlement={sheet.settlement}
          onClose={actions.close}
          onSave={actions.saveSettlement}
          onShare={actions.sharePayslip}
          escapeDisabled={guard}
        />
      );
    default:
      return null;
  }
}
