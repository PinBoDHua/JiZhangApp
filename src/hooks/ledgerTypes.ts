import type { Dispatch, SetStateAction } from 'react';
import type { ConfirmState, SheetState } from '../app/sheetState';
import type {
  ActiveShift,
  AppPreferences,
  MonthlySettlement,
  PlanHistoryEntry,
  PlannedShift,
  ShiftTemplate,
  WorkRecord,
} from '../types';

/** 动作层读取的数据切片（只读） */
export interface LedgerState {
  records: WorkRecord[];
  templates: ShiftTemplate[];
  preferences: AppPreferences;
  activeShift: ActiveShift | null;
  settlements: MonthlySettlement[];
  plans: PlannedShift[];
  planHistory: PlanHistoryEntry[];
}

/** 动作层写回的数据 setter，与 useAppData 的返回值一一对应 */
export interface LedgerSetters {
  setRecords: Dispatch<SetStateAction<WorkRecord[]>>;
  setTemplates: Dispatch<SetStateAction<ShiftTemplate[]>>;
  setPreferences: Dispatch<SetStateAction<AppPreferences>>;
  setActiveShift: Dispatch<SetStateAction<ActiveShift | null>>;
  setSettlements: Dispatch<SetStateAction<MonthlySettlement[]>>;
  setPlans: Dispatch<SetStateAction<PlannedShift[]>>;
  setPlanHistory: Dispatch<SetStateAction<PlanHistoryEntry[]>>;
}

/** 动作层需要的界面能力：当前浮层、关闭浮层、提示与确认 */
export interface LedgerUi {
  sheet: SheetState | null;
  openSheet: (sheet: SheetState) => void;
  closeSheet: () => void;
  notify: (message: string) => void;
  notifyWithAction: (message: string, actionLabel: string, onAction: () => void) => void;
  askConfirm: (state: ConfirmState) => void;
  closeConfirm: () => void;
}

export type PlanActionsOptions = Pick<LedgerState, 'activeShift' | 'plans'> &
  Pick<LedgerSetters, 'setActiveShift' | 'setPlans' | 'setPlanHistory'> &
  LedgerUi;

export type RecordActionsOptions = Pick<
  LedgerState,
  'activeShift' | 'plans' | 'planHistory' | 'records'
> &
  Pick<
    LedgerSetters,
    'setActiveShift' | 'setPlans' | 'setPlanHistory' | 'setRecords'
  > &
  LedgerUi & {
    /** 记录/排班共用同一条「完成排班→历史」的归档逻辑 */
    archivePlan: (
      plan: PlannedShift,
      status: 'completed' | 'skipped',
      recordId: string | null,
    ) => void;
    /** 删除记录时把排班还原成待上 */
    restorePlan: (entry: PlanHistoryEntry) => void;
  };

export type BackupActionsOptions = LedgerState &
  LedgerSetters &
  LedgerUi & {
    /** 导入成功后回到记录页，避免停在设置页看不到结果 */
    goHome: () => void;
  };
