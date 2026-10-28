import { describe, expect, it } from 'vitest';
import { planPay, recordPay, shiftPay } from './utils';
import type { PlannedShift, WorkRecord } from './types';

function makeRecord(overrides: Partial<WorkRecord> = {}): WorkRecord {
  return {
    id: 'r1',
    date: '2026-03-02',
    templateId: 't1',
    shiftName: '早班',
    shiftColor: '#c33',
    start: '08:00',
    end: '17:00',
    breakMinutes: 60,
    rate: 30,
    multiplier: 1,
    note: '',
    overtime: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makePlan(overrides: Partial<PlannedShift> = {}): PlannedShift {
  return {
    id: 'p1',
    date: '2026-03-02',
    templateId: 't1',
    shiftName: '早班',
    shiftColor: '#c33',
    start: '08:00',
    end: '17:00',
    breakMinutes: 60,
    rate: 30,
    multiplier: 1,
    note: '',
    reminderEnabled: true,
    reminderLeadMinutes: 30,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('计薪缓存', () => {
  it('同一对象重复计薪命中缓存，返回同一结果引用', () => {
    const record = makeRecord();
    const first = recordPay(record);
    const second = recordPay(record);
    expect(second).toBe(first);
  });

  it('内容相同但引用不同的对象各自计算，结果相等而不共享引用', () => {
    const a = makeRecord({ id: 'r1' });
    const b = makeRecord({ id: 'r2' });
    const payA = recordPay(a);
    const payB = recordPay(b);
    expect(payA).not.toBe(payB);
    expect(payB).toEqual(payA);
  });

  it('编辑后的新对象重新计薪，不会读到旧金额', () => {
    const before = makeRecord({ rate: 30 });
    expect(recordPay(before).total).toBe(240);
    // 编辑走的是不可变更新：生成新对象，旧对象的缓存自然失效
    const after = { ...before, rate: 60 };
    expect(recordPay(after).total).toBe(480);
    expect(recordPay(before).total).toBe(240);
  });

  it('缓存结果与直接计算完全一致（含加班分段）', () => {
    const overtime = { standardMinutes: 480, multiplier: 1.5 };
    const record = makeRecord({ start: '08:00', end: '20:00', overtime });
    const cached = recordPay(record);
    const direct = shiftPay(record);
    expect(cached).toEqual(direct);
    // 再取一次仍是同一份，且数值未被改动
    expect(recordPay(record)).toBe(cached);
  });

  it('排班与记录共用同一套计薪口径', () => {
    const record = makeRecord();
    const plan = makePlan();
    expect(planPay(plan).total).toBe(recordPay(record).total);
  });

  it('加班倍数低于班次倍数时按班次倍数计，缓存不绕过该规则', () => {
    const record = makeRecord({
      start: '08:00',
      end: '20:00',
      multiplier: 2,
      overtime: { standardMinutes: 480, multiplier: 1.5 },
    });
    const pay = recordPay(record);
    expect(pay.overtime?.multiplier).toBe(2);
    expect(pay.overtimeMinutes).toBe(180);
  });
});
