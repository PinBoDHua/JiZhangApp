/**
 * 对外输出：CSV、工资条文本、文件下载与 id 生成。
 *
 * 这些逻辑都涉及「文本产物格式」，改动会影响用户导出的文件，
 * 因此集中在一处并保持纯函数，便于按导出格式做回归测试。
 */

import type { SettlementAdjustment, SettlementStatus, WorkRecord } from '../types';
import { round2 } from '../num';
import { formatDateFullCN } from './date';
import { formatDuration, formatMoney, formatSignedMoney } from './format';
import { recordPay } from './pay';
import { sortRecords } from './records';

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 立刻 revoke 会让部分浏览器来不及下载，延迟释放
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(records: WorkRecord[]): string {
  const header = [
    '日期',
    '班次',
    '开始',
    '结束',
    '休息(分钟)',
    '工时(小时)',
    '时薪',
    '倍数',
    '正常工时(小时)',
    '加班工时(小时)',
    '加班倍数',
    '收入',
    '备注',
  ];
  const rows = sortRecords(records)
    .reverse()
    .map((record) => {
      const pay = recordPay(record);
      return [
        record.date,
        record.shiftName,
        record.start,
        record.end,
        String(record.breakMinutes),
        (pay.minutes / 60).toFixed(2),
        String(record.rate),
        String(record.multiplier),
        (pay.regularMinutes / 60).toFixed(2),
        (pay.overtimeMinutes / 60).toFixed(2),
        pay.overtime && pay.overtimeMinutes > 0 ? String(pay.overtime.multiplier) : '',
        pay.total.toFixed(2),
        record.note,
      ];
    });
  // 以 = + - @ 开头的单元格会被表格软件当成公式，加单引号前缀阻断 CSV 注入
  const escape = (value: string) => {
    const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${guarded.replace(/"/g, '""')}"`;
  };
  return [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
}

export interface SettlementTotals {
  bonus: number;
  deduction: number;
  advance: number;
  adjustmentTotal: number;
  netDue: number;
}

export function settlementTotals(
  baseEarnings: number,
  adjustments: SettlementAdjustment[],
): SettlementTotals {
  const bonus = round2(
    adjustments
      .filter((item) => item.kind === 'bonus')
      .reduce((sum, item) => sum + item.amount, 0),
  );
  const deduction = round2(
    adjustments
      .filter((item) => item.kind === 'deduction')
      .reduce((sum, item) => sum + item.amount, 0),
  );
  const advance = round2(
    adjustments
      .filter((item) => item.kind === 'advance')
      .reduce((sum, item) => sum + item.amount, 0),
  );
  return {
    bonus,
    deduction,
    advance,
    adjustmentTotal: round2(bonus - deduction - advance),
    netDue: round2(baseEarnings + bonus - deduction - advance),
  };
}

interface PayslipParams {
  monthLabel: string;
  minutes: number;
  days: number;
  baseEarnings: number;
  adjustments: SettlementAdjustment[];
  totals: SettlementTotals;
  status: SettlementStatus;
  paidAt: string | null;
  paidAmount: number | null;
  note: string;
  /** 2.0 起工资条展示加班明细 */
  overtimeMinutes?: number;
  overtimeEarnings?: number;
}

export function buildPayslipText({
  monthLabel,
  minutes,
  days,
  baseEarnings,
  adjustments,
  totals,
  status,
  paidAt,
  paidAmount,
  note,
  overtimeMinutes = 0,
  overtimeEarnings = 0,
}: PayslipParams): string {
  const lines = [
    `工时账本 · ${monthLabel} 工资条`,
    `出勤 ${days} 天 · ${formatDuration(minutes)}`,
    '',
    `工时收入：¥${formatMoney(baseEarnings)}`,
  ];
  if (overtimeMinutes > 0) {
    lines.push(
      `其中加班：${formatDuration(overtimeMinutes)} · ¥${formatMoney(overtimeEarnings)}`,
    );
  }
  const labels: Record<SettlementAdjustment['kind'], string> = {
    bonus: '奖金',
    deduction: '扣款',
    advance: '预支',
  };
  adjustments
    .filter((item) => item.amount > 0)
    .forEach((item) => {
      const sign = item.kind === 'bonus' ? '+' : '-';
      lines.push(`${item.label.trim() || labels[item.kind]}：${sign}¥${formatMoney(item.amount)}`);
    });
  lines.push(`应发：¥${formatMoney(totals.netDue)}`);
  if (status === 'paid') {
    lines.push(`状态：已到账${paidAt ? `（${formatDateFullCN(paidAt)}）` : ''}`);
    if (paidAmount !== null) {
      lines.push(`实发：¥${formatMoney(paidAmount)}`);
      const difference = round2(paidAmount - totals.netDue);
      if (difference !== 0) {
        lines.push(`差额：${formatSignedMoney(difference)}`);
      }
    }
  } else {
    lines.push('状态：待到账');
  }
  if (note.trim()) lines.push(`备注：${note.trim()}`);
  lines.push('', '由工时账本生成');
  return lines.join('\n');
}
