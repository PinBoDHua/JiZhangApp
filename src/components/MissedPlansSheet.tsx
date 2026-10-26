import type { CSSProperties } from 'react';
import { useClock } from '../useClock';
import type { PlannedShift, WorkRecord } from '../types';
import { findMissedPlans } from '../planStats';
import {
  earningsOf,
  formatDateCN,
  formatDuration,
  formatMoney,
  formatTimeRange,
  workedMinutes,
} from '../utils';
import { BottomSheet } from './BottomSheet';
import { BellIcon } from './Icons';

interface MissedPlansSheetProps {
  plans: PlannedShift[];
  records: WorkRecord[];
  activePlanId: string | null;
  onClose: () => void;
  onRecord: (plan: PlannedShift) => void;
  onSkip: (plan: PlannedShift) => void;
  escapeDisabled?: boolean;
}

export function MissedPlansSheet({
  plans,
  records,
  activePlanId,
  onClose,
  onRecord,
  onSkip,
  escapeDisabled = false,
}: MissedPlansSheetProps) {
  const { date: now } = useClock();
  const missedPlans = findMissedPlans(plans, now, activePlanId);

  return (
    <BottomSheet
      title="待处理排班"
      subtitle="补记实际班次，或标记未上"
      onClose={onClose}
      escapeDisabled={escapeDisabled}
    >
      {missedPlans.length === 0 ? (
        <div className="missed-empty">
          <span className="missed-empty-icon">
            <BellIcon size={26} />
          </span>
          <h3>没有待处理排班</h3>
          <p>已结束的排班都已补记或标记。</p>
        </div>
      ) : (
        <div className="missed-plan-list">
          <p className="missed-summary">
            共 {missedPlans.length} 个排班需要处理
          </p>
          {missedPlans.map((plan) => {
            const recordCount = records.filter((record) => record.date === plan.date).length;
            const minutes = workedMinutes(plan.start, plan.end, plan.breakMinutes);
            return (
              <article
                key={plan.id}
                className="missed-plan-row"
                style={{ '--shift-color': plan.shiftColor } as CSSProperties}
              >
                <div className="missed-plan-head">
                  <span className="missed-plan-date">{formatDateCN(plan.date)}</span>
                  <span className="missed-plan-name">
                    <i className="shift-dot" aria-hidden="true" />
                    {plan.shiftName}
                  </span>
                </div>
                <p className="missed-plan-meta">
                  {formatTimeRange(plan.start, plan.end)} · {formatDuration(minutes)}
                  <span className="dot-divider" aria-hidden="true" />
                  预计 ¥{formatMoney(earningsOf(plan))}
                </p>
                {plan.note ? <p className="missed-plan-note">{plan.note}</p> : null}
                {recordCount > 0 ? (
                  <p className="missed-plan-record-hint">
                    当天已有 {recordCount} 条记录，补记前请先核对
                  </p>
                ) : null}
                <div className="missed-plan-actions">
                  <button
                    type="button"
                    className="missed-plan-record"
                    onClick={() => onRecord(plan)}
                  >
                    补记
                  </button>
                  <button
                    type="button"
                    className="missed-plan-skip"
                    onClick={() => onSkip(plan)}
                  >
                    标记未上
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}
