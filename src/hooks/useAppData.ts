import { useEffect, useState } from 'react';
import {
  loadActiveShift,
  loadPlanHistory,
  loadPlans,
  loadPreferences,
  loadRecords,
  loadSettlements,
  loadTemplates,
  saveActiveShift,
  savePlanHistory,
  savePlans,
  savePreferences,
  saveRecords,
  saveSettlements,
  saveTemplates,
} from '../storage';
import type {
  ActiveShift,
  AppPreferences,
  MonthlySettlement,
  PlanHistoryEntry,
  PlannedShift,
  ShiftTemplate,
  WorkRecord,
} from '../types';
import { sortPlans } from '../utils';

/**
 * 本机数据仓库：七个集合「读取一次 → 变更即保存」，排班保存前统一排序。
 */
export function useAppData() {
  const [records, setRecords] = useState<WorkRecord[]>(() => loadRecords());
  const [templates, setTemplates] = useState<ShiftTemplate[]>(() => loadTemplates());
  const [preferences, setPreferences] = useState<AppPreferences>(() => loadPreferences());
  const [activeShift, setActiveShift] = useState<ActiveShift | null>(() => loadActiveShift());
  const [settlements, setSettlements] = useState<MonthlySettlement[]>(() => loadSettlements());
  const [plans, setPlans] = useState<PlannedShift[]>(() => loadPlans());
  const [planHistory, setPlanHistory] = useState<PlanHistoryEntry[]>(() => loadPlanHistory());

  useEffect(() => {
    saveRecords(records);
  }, [records]);

  useEffect(() => {
    saveTemplates(templates);
  }, [templates]);

  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    saveActiveShift(activeShift);
  }, [activeShift]);

  useEffect(() => {
    saveSettlements(settlements);
  }, [settlements]);

  useEffect(() => {
    savePlans(sortPlans(plans));
  }, [plans]);

  useEffect(() => {
    savePlanHistory(planHistory);
  }, [planHistory]);

  return {
    records,
    setRecords,
    templates,
    setTemplates,
    preferences,
    setPreferences,
    activeShift,
    setActiveShift,
    settlements,
    setSettlements,
    plans,
    setPlans,
    planHistory,
    setPlanHistory,
  };
}
