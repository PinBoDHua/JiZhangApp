import type { PlannedShift, ShiftTemplate } from './types';
import { addDaysISO, earningsOf, workedMinutes } from './utils';

export const MAX_ROTATION_CYCLE_DAYS = 28;

export type RotationSlot = string | null;

export interface RotationPreset {
  id: string;
  name: string;
  description: string;
  cycle: RotationSlot[];
}

export interface RotationDay {
  date: string;
  templateId: RotationSlot;
}

export interface RotationShift {
  date: string;
  template: ShiftTemplate;
}

export interface RotationPreview {
  totalDays: number;
  restDays: number;
  shifts: RotationShift[];
  skipped: RotationShift[];
  minutes: number;
  earnings: number;
}

function shortName(template: ShiftTemplate): string {
  return template.name.replace(/班$/, '');
}

function pickDayNightTemplates(
  templates: ShiftTemplate[],
): { day: ShiftTemplate; night: ShiftTemplate } | null {
  if (templates.length < 2) return null;
  const day = templates.find((template) => template.name.includes('白')) ?? templates[0];
  const night =
    templates.find((template) => template.name.includes('夜') && template.id !== day.id) ??
    templates.find((template) => template.id !== day.id);
  if (!night) return null;
  return { day, night };
}

export function getRotationPresets(templates: ShiftTemplate[]): RotationPreset[] {
  const pair = pickDayNightTemplates(templates);
  if (!pair) return [];
  const day = shortName(pair.day);
  const night = shortName(pair.night);
  return [
    {
      id: 'three-crew',
      name: `${day}/${night}/休`,
      description: '三班两运转 · 3 天一轮',
      cycle: [pair.day.id, pair.night.id, null],
    },
    {
      id: 'four-crew',
      name: `${day}/${day}/${night}/${night}/休/休`,
      description: '四班两运转 · 6 天一轮',
      cycle: [pair.day.id, pair.day.id, pair.night.id, pair.night.id, null, null],
    },
    {
      id: 'two-on-two-off',
      name: `${day}/${night}/休/休`,
      description: '上二休二 · 4 天一轮',
      cycle: [pair.day.id, pair.night.id, null, null],
    },
  ];
}

export function cycleRotationDays(
  startISO: string,
  weeks: number,
  cycle: RotationSlot[],
): RotationDay[] {
  const normalized = cycle.slice(0, MAX_ROTATION_CYCLE_DAYS);
  if (normalized.length === 0) return [];
  const dayCount = Math.max(1, Math.min(52, Math.floor(weeks))) * 7;
  return Array.from({ length: dayCount }, (_, index) => ({
    date: addDaysISO(startISO, index),
    templateId: normalized[index % normalized.length],
  }));
}

export function buildRotationPreview(
  startISO: string,
  weeks: number,
  cycle: RotationSlot[],
  templates: ShiftTemplate[],
  existingPlans: PlannedShift[],
): RotationPreview {
  const byId = new Map(templates.map((template) => [template.id, template]));
  const occupied = new Set(existingPlans.map((plan) => plan.date));
  const days = cycleRotationDays(startISO, weeks, cycle);
  const shifts: RotationShift[] = [];
  const skipped: RotationShift[] = [];
  let restDays = 0;

  days.forEach((day) => {
    if (!day.templateId) {
      restDays += 1;
      return;
    }
    const template = byId.get(day.templateId);
    if (!template) {
      restDays += 1;
      return;
    }
    const entry = { date: day.date, template };
    if (occupied.has(day.date)) {
      skipped.push(entry);
    } else {
      shifts.push(entry);
    }
  });

  return {
    totalDays: days.length,
    restDays,
    shifts,
    skipped,
    minutes: shifts.reduce(
      (sum, item) =>
        sum + workedMinutes(item.template.start, item.template.end, item.template.breakMinutes),
      0,
    ),
    earnings: shifts.reduce(
      (sum, item) => sum + earningsOf({ ...item.template, multiplier: 1 }),
      0,
    ),
  };
}
