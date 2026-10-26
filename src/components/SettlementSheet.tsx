import { useState } from 'react';
import type {
  MonthlySettlement,
  SettlementAdjustment,
  SettlementAdjustmentKind,
  SettlementStatus,
} from '../types';
import {
  buildPayslipText,
  formatDuration,
  formatMoney,
  settlementTotals,
  toISODate,
  uid,
} from '../utils';
import { useClock } from '../useClock';
import { sanitizeNumberText } from '../numberText';
import { BottomSheet } from './BottomSheet';
import { CloseIcon, PlusIcon } from './Icons';
import { NumberInput } from './NumberInput';

const KIND_LABELS: Record<SettlementAdjustmentKind, string> = {
  bonus: '奖金',
  deduction: '扣款',
  advance: '预支',
};

const KIND_SIGNS: Record<SettlementAdjustmentKind, string> = {
  bonus: '+',
  deduction: '−',
  advance: '−',
};

export interface SettlementInput {
  status: SettlementStatus;
  paidAt: string | null;
  paidAmount: number | null;
  note: string;
  adjustments: SettlementAdjustment[];
}

interface SettlementSheetProps {
  monthLabel: string;
  baseEarnings: number;
  baseMinutes: number;
  workedDays: number;
  settlement?: MonthlySettlement;
  onClose: () => void;
  onSave: (input: SettlementInput) => void;
  onShare: (text: string) => void;
  escapeDisabled?: boolean;
}

export function SettlementSheet({
  monthLabel,
  baseEarnings,
  baseMinutes,
  workedDays,
  settlement,
  onClose,
  onSave,
  onShare,
  escapeDisabled = false,
}: SettlementSheetProps) {
  const { date } = useClock();
  const today = toISODate(date);
  const [adjustments, setAdjustments] = useState<SettlementAdjustment[]>(
    () => settlement?.adjustments.map((item) => ({ ...item })) ?? [],
  );
  const [status, setStatus] = useState<SettlementStatus>(settlement?.status ?? 'pending');
  const [paidAt, setPaidAt] = useState(settlement?.paidAt ?? '');
  const [paidAmountInput, setPaidAmountInput] = useState(
    settlement?.paidAmount !== null && settlement?.paidAmount !== undefined
      ? String(settlement.paidAmount)
      : '',
  );
  const [note, setNote] = useState(settlement?.note ?? '');

  const totals = settlementTotals(baseEarnings, adjustments);
  const parsedPaidAmount =
    paidAmountInput.trim() === '' ? totals.netDue : Math.max(0, Number(paidAmountInput) || 0);
  const difference =
    status === 'paid' ? Math.round((parsedPaidAmount - totals.netDue) * 100) / 100 : 0;

  const addAdjustment = (kind: SettlementAdjustmentKind) => {
    setAdjustments((prev) => [
      ...prev,
      { id: uid(), kind, label: '', amount: 0 },
    ]);
  };

  const updateAdjustment = (id: string, patch: Partial<SettlementAdjustment>) => {
    setAdjustments((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const handleShare = () => {
    onShare(
      buildPayslipText({
        monthLabel,
        minutes: baseMinutes,
        days: workedDays,
        baseEarnings,
        adjustments,
        totals,
        status,
        paidAt: status === 'paid' ? paidAt || today : null,
        paidAmount: status === 'paid' ? parsedPaidAmount : null,
        note,
      }),
    );
  };

  const handleSave = () => {
    const cleaned = adjustments
      .filter((item) => item.amount > 0)
      .map((item) => ({
        ...item,
        label: item.label.trim() || KIND_LABELS[item.kind],
        amount: Math.round(item.amount * 100) / 100,
      }));
    onSave({
      status,
      paidAt: status === 'paid' ? paidAt || today : null,
      paidAmount: status === 'paid' ? parsedPaidAmount : null,
      note: note.trim(),
      adjustments: cleaned,
    });
  };

  return (
    <BottomSheet
      title="工资结算"
      subtitle={monthLabel}
      onClose={onClose}
      escapeDisabled={escapeDisabled}
      action={
        <button type="button" className="sheet-share" onClick={handleShare}>
          工资条
        </button>
      }
      footer={
        <>
          <div className="pay-preview">
            <div className="pay-preview-main">
              <span>{status === 'paid' ? '实发金额' : '本月应发'}</span>
              <strong>
                <small>¥</small>
                {formatMoney(status === 'paid' ? parsedPaidAmount : totals.netDue)}
              </strong>
            </div>
            <span className="pay-preview-meta">
              工时 ¥{formatMoney(baseEarnings)} · 调整{' '}
              {totals.adjustmentTotal >= 0 ? '+' : '−'}¥
              {formatMoney(Math.abs(totals.adjustmentTotal))}
            </span>
          </div>
          <button type="button" className="primary-button save-button" onClick={handleSave}>
            保存结算
          </button>
        </>
      }
    >
      <div className="form">
        <div className="settlement-sheet-summary">
          <div className="settlement-sheet-summary-head">
            <span>工时收入</span>
            <strong>¥{formatMoney(baseEarnings)}</strong>
          </div>
          <span className="settlement-sheet-summary-sub">
            出勤 {workedDays} 天 · {formatDuration(baseMinutes)}
          </span>
          <div className="settlement-sheet-totals">
            {totals.bonus > 0 ? (
              <span className="is-plus">奖金 +¥{formatMoney(totals.bonus)}</span>
            ) : null}
            {totals.deduction > 0 ? (
              <span className="is-minus">扣款 −¥{formatMoney(totals.deduction)}</span>
            ) : null}
            {totals.advance > 0 ? (
              <span className="is-minus">预支 −¥{formatMoney(totals.advance)}</span>
            ) : null}
            {!totals.bonus && !totals.deduction && !totals.advance ? (
              <span className="is-muted">暂无调整项</span>
            ) : null}
          </div>
          <div className="settlement-sheet-net">
            <span>本月应发</span>
            <strong>¥{formatMoney(totals.netDue)}</strong>
          </div>
        </div>

        <div className="field">
          <span className="field-label">
            调整项
            <small className="field-label-note">奖金、扣款和预支</small>
          </span>
          {adjustments.length > 0 ? (
            <div className="adjustment-list">
              {adjustments.map((item) => (
                <div className="adjustment-row" key={item.id}>
                  <span className={`adjustment-kind is-${item.kind}`}>
                    {KIND_LABELS[item.kind]}
                  </span>
                  <input
                    className="adjustment-label"
                    value={item.label}
                    onChange={(event) => updateAdjustment(item.id, { label: event.target.value })}
                    placeholder={`${KIND_LABELS[item.kind]}名称`}
                    maxLength={16}
                    aria-label={`${KIND_LABELS[item.kind]}名称`}
                  />
                  <div className="adjustment-amount">
                    <span>{KIND_SIGNS[item.kind]}¥</span>
                    <NumberInput
                      inputMode="decimal"
                      min={0}
                      value={item.amount}
                      emptyWhenZero
                      onChange={(amount) => updateAdjustment(item.id, { amount })}
                      placeholder="0"
                      ariaLabel={`${KIND_LABELS[item.kind]}金额`}
                    />
                  </div>
                  <button
                    type="button"
                    className="adjustment-remove"
                    onClick={() =>
                      setAdjustments((prev) => prev.filter((row) => row.id !== item.id))
                    }
                    aria-label={`删除${KIND_LABELS[item.kind]}调整项`}
                  >
                    <CloseIcon size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="adjustment-empty">还没有调整项，可在下方添加奖金、扣款或预支。</p>
          )}
          <div className="adjustment-add-row">
            {(['bonus', 'deduction', 'advance'] as SettlementAdjustmentKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                className={`adjustment-add is-${kind}`}
                onClick={() => addAdjustment(kind)}
              >
                <PlusIcon size={13} />
                {KIND_LABELS[kind]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">到账状态</span>
          <div className="segmented-control settlement-status-tabs" role="group" aria-label="到账状态">
            <button
              type="button"
              className={status === 'pending' ? 'is-active' : ''}
              onClick={() => setStatus('pending')}
              aria-pressed={status === 'pending'}
            >
              待到账
            </button>
            <button
              type="button"
              className={status === 'paid' ? 'is-active' : ''}
              onClick={() => {
                setStatus('paid');
                if (!paidAt) setPaidAt(today);
              }}
              aria-pressed={status === 'paid'}
            >
              已到账
            </button>
          </div>
        </div>

        {status === 'paid' ? (
          <>
            <div className="settlement-paid-fields">
              <label className="field">
                <span className="field-label">到账日期</span>
                <input
                  type="date"
                  className="text-input"
                  value={paidAt}
                  onChange={(event) => setPaidAt(event.target.value)}
                  aria-label="到账日期"
                />
              </label>
              <label className="field">
                <span className="field-label">实际到账</span>
                <div className="input-affix">
                  <span>¥</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={paidAmountInput}
                    onChange={(event) =>
                      setPaidAmountInput(sanitizeNumberText(event.target.value, false))
                    }
                    placeholder={formatMoney(totals.netDue)}
                    aria-label="实际到账金额"
                  />
                </div>
              </label>
            </div>
            <p className={`settlement-diff-hint${difference === 0 ? ' is-even' : ''}`}>
              {difference === 0
                ? '实际到账与应发金额一致'
                : difference > 0
                  ? `实际到账比应发多 ¥${formatMoney(difference)}`
                  : `实际到账比应发少 ¥${formatMoney(Math.abs(difference))}`}
            </p>
          </>
        ) : null}

        <div className="field">
          <span className="field-label">备注</span>
          <input
            className="text-input"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="可选，如：加班补贴下月发"
            maxLength={60}
          />
        </div>
      </div>
    </BottomSheet>
  );
}
