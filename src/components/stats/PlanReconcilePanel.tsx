import type { PlanReconciliation } from '../../planStats';
import {
  formatDuration,
  formatMoney,
  formatSignedCount,
  formatSignedDuration,
  formatSignedMoney,
} from '../../utils';
import { ChevronRightIcon } from '../Icons';

interface PlanReconcilePanelProps {
  reconciliation: PlanReconciliation;
  /** 完成率百分比，未到期时为 null */
  ratePercent: number | null;
  onOpenMissed: () => void;
}

/**
 * 排班对账面板：计划完成率、四类状态计数，以及「计划 vs 实际」的差额。
 * 差额的符号与单位统一交给 utils 里的 formatSigned*，避免 JSX 里嵌套三层三元。
 */
export function PlanReconcilePanel({
  reconciliation,
  ratePercent,
  onOpenMissed,
}: PlanReconcilePanelProps) {
  const diffClass =
    reconciliation.diffEarnings > 0
      ? 'is-up'
      : reconciliation.diffEarnings < 0
        ? 'is-down'
        : 'is-even';

  return (
    <section className="panel plan-reconcile-panel" aria-label="排班对账">
      <div className="panel-head">
        <div>
          <h2>排班对账</h2>
          <p>已到期计划与实际记录</p>
        </div>
        <div className="plan-reconcile-rate">
          <span>完成率</span>
          <strong>{ratePercent !== null ? `${ratePercent}%` : '—'}</strong>
        </div>
      </div>
      <div className="plan-reconcile-bar" aria-hidden="true">
        <span style={{ width: `${ratePercent ?? 0}%` }} />
      </div>
      <div className="plan-reconcile-counts">
        <span>
          <strong>{reconciliation.completed}</strong> 已完成
        </span>
        <span>
          <strong>{reconciliation.skipped}</strong> 未上
        </span>
        <span className={reconciliation.missed > 0 ? 'is-warning' : ''}>
          <strong>{reconciliation.missed}</strong> 待补记
        </span>
        <span>
          <strong>{reconciliation.upcoming}</strong> 待上
        </span>
      </div>
      {reconciliation.due > 0 ? (
        <div className="plan-reconcile-compare">
          <div className="plan-reconcile-compare-item">
            <span>已到期计划</span>
            <strong>{reconciliation.due} 班</strong>
            <small>
              {formatDuration(reconciliation.plannedDueMinutes)} · ¥
              {formatMoney(reconciliation.plannedDueEarnings)}
            </small>
          </div>
          <div className="plan-reconcile-compare-item">
            <span>实际记录</span>
            <strong>{reconciliation.actualShifts} 班</strong>
            <small>
              {formatDuration(reconciliation.actualMinutes)} · ¥
              {formatMoney(reconciliation.actualEarnings)}
            </small>
          </div>
          <div className={`plan-reconcile-compare-item ${diffClass}`}>
            <span>差额</span>
            <strong>{formatSignedCount(reconciliation.diffShifts)} 班</strong>
            <small>
              {formatSignedDuration(reconciliation.diffMinutes)} ·{' '}
              {formatSignedMoney(reconciliation.diffEarnings)}
            </small>
          </div>
        </div>
      ) : (
        <p className="plan-reconcile-empty">本月还没有已到期的排班。</p>
      )}
      {reconciliation.missed > 0 ? (
        <button type="button" className="plan-reconcile-action" onClick={onOpenMissed}>
          <span>去处理 {reconciliation.missed} 个待补记排班</span>
          <ChevronRightIcon size={15} />
        </button>
      ) : null}
    </section>
  );
}
