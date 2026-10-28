import type { CSSProperties } from 'react';
import type { BreakdownItem } from '../../statsRange';
import { formatDuration, formatMoney } from '../../utils';

interface ShiftBreakdownProps {
  items: BreakdownItem[];
  subtitle: string;
  /** 「本周 / 本月 / 今年」，仅用于空状态文案 */
  emptyLabel: string;
  totalEarnings: number;
}

/** 班次构成：按班次汇总收入与占比 */
export function ShiftBreakdown({
  items,
  subtitle,
  emptyLabel,
  totalEarnings,
}: ShiftBreakdownProps) {
  return (
    <section className="panel breakdown-panel">
      <div className="panel-head">
        <div>
          <h2>班次构成</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="small-empty">
          <p>{emptyLabel}还没有班次记录</p>
          <span>切换周期，或从「记录」页开始记一班。</span>
        </div>
      ) : (
        <ul className="shift-breakdown">
          {items.map((item) => {
            const share = totalEarnings > 0 ? (item.earnings / totalEarnings) * 100 : 0;
            return (
              <li key={item.name} style={{ '--shift-color': item.color } as CSSProperties}>
                <div className="breakdown-top">
                  <span className="breakdown-name">
                    <span className="shift-dot" aria-hidden="true" />
                    {item.name}
                    <small>
                      {item.count} 班 · {formatDuration(item.minutes)}
                    </small>
                  </span>
                  <strong>¥{formatMoney(item.earnings)}</strong>
                </div>
                <div className="breakdown-bar">
                  <span style={{ width: `${Math.max(share, 2)}%` }} />
                </div>
                <span className="breakdown-share">占收入 {Math.round(share)}%</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
