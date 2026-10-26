import { useState } from 'react';
import type { ShiftTemplate } from '../types';
import {
  formatDateCN,
  formatTimeHM,
  toISODate,
} from '../utils';
import { useClock } from '../useClock';
import { BottomSheet } from './BottomSheet';
import { CheckIcon, ClockIcon } from './Icons';

interface StartTimingSheetProps {
  templates: ShiftTemplate[];
  defaultTemplate: ShiftTemplate | null;
  onClose: () => void;
  onStart: (template: ShiftTemplate) => void;
  escapeDisabled?: boolean;
}

export function StartTimingSheet({
  templates,
  defaultTemplate,
  onClose,
  onStart,
  escapeDisabled = false,
}: StartTimingSheetProps) {
  const { date } = useClock();
  const [selectedId, setSelectedId] = useState(
    () => defaultTemplate?.id ?? templates[0]?.id ?? null,
  );
  const selected = templates.find((template) => template.id === selectedId) ?? null;

  return (
    <BottomSheet
      title="开始打卡"
      subtitle="结束时确认工时，再生成记录"
      onClose={onClose}
      escapeDisabled={escapeDisabled}
      footer={
        <>
          <button
            type="button"
            className="primary-button save-button"
            onClick={() => {
              if (selected) onStart(selected);
            }}
            disabled={!selected}
          >
            开始计时
          </button>
        </>
      }
    >
      <div className="form">
        {templates.length > 0 ? (
          <>
            <div className="field">
              <span className="field-label">选择班次</span>
              <div className="timing-options">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={`timing-option${template.id === selectedId ? ' is-active' : ''}`}
                    onClick={() => setSelectedId(template.id)}
                    aria-pressed={template.id === selectedId}
                  >
                    <span
                      className="timing-option-dot"
                      style={{ backgroundColor: template.color }}
                      aria-hidden="true"
                    />
                    <span className="timing-option-main">
                      <strong>{template.name}</strong>
                      <small>
                        ¥{template.rate}/时 ·{' '}
                        {template.breakMinutes > 0 ? `休息 ${template.breakMinutes} 分` : '无休息'}
                      </small>
                    </span>
                    {template.id === selectedId ? (
                      <span className="timing-option-check" aria-hidden="true">
                        <CheckIcon size={13} />
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            <div className="timing-now">
              <ClockIcon size={20} />
              <div>
                <span>现在开始</span>
                <strong>{formatTimeHM(date)}</strong>
              </div>
              <span className="timing-now-date">{formatDateCN(toISODate(date))}</span>
            </div>

            <p className="field-hint">
              点击结束后会进入结算确认，保存后才生成记录；休息时长和备注都可以再调整。
            </p>
          </>
        ) : (
          <div className="small-empty">
            <p>还没有可用的班次</p>
            <span>请先在设置中新增一个班次，再回来打卡。</span>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
