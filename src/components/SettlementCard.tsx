import type { MonthlySettlement } from '../types';
import {
  formatDateFullCN,
  formatMoney,
  settlementTotals,
} from '../utils';
import { ChevronRightIcon, WalletIcon } from './Icons';

interface SettlementCardProps {
  settlement?: MonthlySettlement;
  baseEarnings: number;
  monthLabel: string;
  onOpen: () => void;
}

export function SettlementCard({
  settlement,
  baseEarnings,
  monthLabel,
  onOpen,
}: SettlementCardProps) {
  const totals = settlementTotals(baseEarnings, settlement?.adjustments ?? []);
  const isPaid = settlement?.status === 'paid';
  const statusKey = !settlement ? 'none' : settlement.status;
  const statusLabel = !settlement ? '待结算' : isPaid ? '已到账' : '待到账';
  const displayAmount = isPaid
    ? (settlement?.paidAmount ?? totals.netDue)
    : totals.netDue;
  const difference = isPaid
    ? Math.round(((settlement?.paidAmount ?? totals.netDue) - totals.netDue) * 100) /
      100
    : 0;
  const hasAdjustments =
    totals.bonus > 0 || totals.deduction > 0 || totals.advance > 0;

  return (
    <button
      type="button"
      className="settlement-card"
      onClick={onOpen}
      aria-label={`${monthLabel}工资结算，${statusLabel}，${isPaid ? '实发' : '应发'} ${formatMoney(displayAmount)} 元`}
    >
      <span className="settlement-card-head">
        <span className="settlement-card-title">
          <span className="settlement-card-icon" aria-hidden="true">
            <WalletIcon size={17} />
          </span>
          工资结算
        </span>
        <span className={`settlement-badge is-${statusKey}`}>{statusLabel}</span>
      </span>

      <span className="settlement-card-main">
        <span className="settlement-card-copy">
          <span className="settlement-card-label">
            {isPaid ? '实发金额' : '本月应发'}
          </span>
          <span className="settlement-card-amount">
            <small>¥</small>
            {formatMoney(displayAmount)}
          </span>
        </span>
        <span className="settlement-card-open">
          结算
          <ChevronRightIcon size={14} />
        </span>
      </span>

      <span className="settlement-card-meta">
        {isPaid ? (
          <>
            应发 ¥{formatMoney(totals.netDue)}
            {settlement?.paidAt ? ` · ${formatDateFullCN(settlement.paidAt)} 到账` : ''}
          </>
        ) : (
          <>工时收入 ¥{formatMoney(baseEarnings)}</>
        )}
      </span>

      {hasAdjustments ? (
        <span className="settlement-card-adjustments">
          {totals.bonus > 0 ? <span className="is-plus">奖金 +¥{formatMoney(totals.bonus)}</span> : null}
          {totals.deduction > 0 ? (
            <span className="is-minus">扣款 −¥{formatMoney(totals.deduction)}</span>
          ) : null}
          {totals.advance > 0 ? (
            <span className="is-minus">预支 −¥{formatMoney(totals.advance)}</span>
          ) : null}
        </span>
      ) : !isPaid ? (
        <span className="settlement-card-adjustments is-empty">
          点击补充奖金、扣款、预支和到账情况
        </span>
      ) : null}

      {isPaid && difference !== 0 ? (
        <span className={`settlement-card-diff${difference > 0 ? ' is-plus' : ' is-minus'}`}>
          与应发相差 {difference > 0 ? '+' : '−'}¥{formatMoney(Math.abs(difference))}
        </span>
      ) : null}
    </button>
  );
}
