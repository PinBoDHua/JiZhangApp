export interface ShiftTemplate {
  id: string;
  name: string;
  color: string;
  start: string;
  end: string;
  breakMinutes: number;
  rate: number;
}

export interface WorkRecord {
  id: string;
  date: string;
  templateId: string | null;
  shiftName: string;
  shiftColor: string;
  start: string;
  end: string;
  breakMinutes: number;
  rate: number;
  multiplier: number;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export interface ActiveShift {
  templateId: string | null;
  sourcePlanId: string | null;
  shiftName: string;
  shiftColor: string;
  startDate: string;
  startTime: string;
  startedAt: number;
  pausedAt: number | null;
  pausedMs: number;
  breakMinutes: number;
  rate: number;
  multiplier: number;
  note: string;
}

export interface PlannedShift {
  id: string;
  date: string;
  templateId: string | null;
  shiftName: string;
  shiftColor: string;
  start: string;
  end: string;
  breakMinutes: number;
  rate: number;
  multiplier: number;
  note: string;
  createdAt: number;
  updatedAt: number;
  reminderEnabled?: boolean;
  reminderLeadMinutes?: number | null;
}

export type PlanInput = Omit<PlannedShift, 'id' | 'createdAt' | 'updatedAt'>;

export type PlanHistoryStatus = 'completed' | 'skipped';

export interface PlanHistoryEntry extends PlannedShift {
  status: PlanHistoryStatus;
  recordId: string | null;
  completedAt: number;
}

export type SettlementAdjustmentKind = 'bonus' | 'deduction' | 'advance';

export interface SettlementAdjustment {
  id: string;
  kind: SettlementAdjustmentKind;
  label: string;
  amount: number;
}

export type SettlementStatus = 'pending' | 'paid';

export interface MonthlySettlement {
  monthKey: string;
  status: SettlementStatus;
  paidAt: string | null;
  paidAmount: number | null;
  note: string;
  adjustments: SettlementAdjustment[];
  updatedAt: number;
}

export interface SettlementOpenContext {
  monthKey: string;
  monthLabel: string;
  baseEarnings: number;
  baseMinutes: number;
  workedDays: number;
}

export type RecordInput = Omit<WorkRecord, 'id' | 'createdAt' | 'updatedAt'>;

export type Tab = 'home' | 'calendar' | 'stats' | 'settings';

export type StatsPeriod = 'week' | 'month' | 'year';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface AppPreferences {
  monthlyGoal: number;
  theme: ThemePreference;
  lastBackupAt: number | null;
  reminderEnabled: boolean;
  reminderLeadMinutes: number;
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  monthlyGoal: 0,
  theme: 'system',
  lastBackupAt: null,
  reminderEnabled: false,
  reminderLeadMinutes: 60,
};

export type BackupPreferences = Pick<AppPreferences, 'monthlyGoal' | 'theme'>;

export interface BackupData {
  app: 'shift-ledger';
  version: 1;
  exportedAt: string;
  templates: ShiftTemplate[];
  records: WorkRecord[];
  preferences?: BackupPreferences;
  settlements?: MonthlySettlement[];
  plans?: PlannedShift[];
  planHistory?: PlanHistoryEntry[];
}

export const SHIFT_COLORS = [
  '#D08A2E',
  '#5563B8',
  '#3C7D6C',
  '#D45A3C',
  '#8A659E',
  '#64707D',
] as const;

export const SHIFT_COLOR_NAMES: Record<(typeof SHIFT_COLORS)[number], string> = {
  '#D08A2E': '琥珀',
  '#5563B8': '靛蓝',
  '#3C7D6C': '松绿',
  '#D45A3C': '柿红',
  '#8A659E': '紫藤',
  '#64707D': '石墨',
};

export const DEFAULT_TEMPLATES: ShiftTemplate[] = [
  {
    id: 'template-day',
    name: '白班',
    color: SHIFT_COLORS[0],
    start: '08:00',
    end: '17:00',
    breakMinutes: 60,
    rate: 20,
  },
  {
    id: 'template-night',
    name: '夜班',
    color: SHIFT_COLORS[1],
    start: '20:00',
    end: '08:00',
    breakMinutes: 60,
    rate: 30,
  },
];
