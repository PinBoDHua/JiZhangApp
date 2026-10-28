import type { ActiveShift } from '../types';
import type {
  MonthlySettlement,
  PlannedShift,
  SettlementOpenContext,
  ShiftTemplate,
  WorkRecord,
} from '../types';

/**
 * 应用层的浮层状态。
 * 用一个可辨识联合描述「当前打开了哪个浮层、带着什么上下文」，
 * 让 App 的渲染和动作层都能在类型层面穷举全部分支。
 */
export type SheetState =
  | {
      kind: 'record';
      record?: WorkRecord;
      plan?: PlannedShift;
      template?: ShiftTemplate | null;
      date?: string;
    }
  | { kind: 'plan'; plan?: PlannedShift; date?: string }
  | { kind: 'batch'; date?: string }
  | { kind: 'rotation'; date?: string }
  | { kind: 'missed' }
  | { kind: 'template'; template?: ShiftTemplate }
  | { kind: 'goal' }
  | { kind: 'startTiming' }
  | { kind: 'endTiming'; shift: ActiveShift; endTime: string; endAt: number }
  | {
      kind: 'settlement';
      context: SettlementOpenContext;
      settlement?: MonthlySettlement;
    };

export type SheetKind = SheetState['kind'];

export interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

/** 从联合里取出某个 kind 的载荷，动作层用它做类型收窄 */
export type SheetPayload<K extends SheetKind> = Extract<SheetState, { kind: K }>;
