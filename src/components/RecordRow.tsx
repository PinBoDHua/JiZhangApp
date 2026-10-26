import type { WorkRecord } from '../types';
import {
  formatDuration,
  formatMoney,
  isOvernight,
  recordEarnings,
  recordMinutes,
} from '../utils';
import { MoonIcon } from './Icons';

interface RecordRowProps {
  record: WorkRecord;
  onClick: (record: WorkRecord) => void;
}

export function RecordRow({ record, onClick }: RecordRowProps) {
  const minutes = recordMinutes(record);
  const overnight = isOvernight(record.start, record.end);

  return (
    <button
      type="button"
      className="record-row"
      onClick={() => onClick(record)}
      aria-label={`编辑 ${record.date} ${record.shiftName} 记录`}
    >
      <span
        className="record-stripe"
        style={{ backgroundColor: record.shiftColor }}
        aria-hidden="true"
      />
      <span className="record-main">
        <span className="record-title">
          <span className="record-name">{record.shiftName}</span>
          {overnight ? (
            <span className="mini-tag">
              <MoonIcon size={11} />
              跨夜
            </span>
          ) : null}
          {record.multiplier !== 1 ? (
            <span className="mini-tag is-accent">×{record.multiplier}</span>
          ) : null}
        </span>
        <span className="record-sub">
          {record.start} – {record.end} · {formatDuration(minutes)}
          {record.note ? ` · ${record.note}` : ''}
        </span>
      </span>
      <span className="record-money">
        <span>¥</span>
        {formatMoney(recordEarnings(record))}
      </span>
    </button>
  );
}
