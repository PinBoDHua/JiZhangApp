import { useState } from 'react';
import { formatMoney } from '../utils';
import { BottomSheet } from './BottomSheet';

interface GoalSheetProps {
  goal: number;
  onClose: () => void;
  onSave: (goal: number) => void;
  escapeDisabled?: boolean;
}

const PRESETS = [3000, 5000, 8000, 10000, 15000];

export function GoalSheet({ goal, onClose, onSave, escapeDisabled = false }: GoalSheetProps) {
  const [draft, setDraft] = useState(goal > 0 ? String(goal) : '');
  const value = draft.trim() === '' ? 0 : Number(draft);
  const valid = Number.isFinite(value) && value >= 0 && value <= 10_000_000;

  return (
    <BottomSheet
      title="月收入目标"
      subtitle="给每个月一个看得见的终点"
      onClose={onClose}
      escapeDisabled={escapeDisabled}
      footer={
        <>
          {!valid ? <p className="form-error" role="alert">请输入 0 到 1000 万之间的金额</p> : null}
          <div className="goal-preview">
            <span>每月目标</span>
            <strong>
              <small>¥</small>
              {formatMoney(value)}
            </strong>
          </div>
          <button
            type="button"
            className="primary-button save-button"
            onClick={() => onSave(value)}
            disabled={!valid}
          >
            保存目标
          </button>
          {goal > 0 ? (
            <button type="button" className="goal-clear-button" onClick={() => onSave(0)}>
              清除目标
            </button>
          ) : null}
        </>
      }
    >
      <div className="form">
        <div className="field">
          <span className="field-label">目标金额（元/月）</span>
          <div className="goal-input-wrap">
            <span>¥</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={100}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="比如 5000"
              aria-label="月收入目标金额"
            />
            <small>元</small>
          </div>
        </div>

        <div className="field">
          <span className="field-label">快速选择</span>
          <div className="chip-row goal-presets">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`goal-preset${value === preset ? ' is-active' : ''}`}
                onClick={() => setDraft(String(preset))}
              >
                ¥{formatMoney(preset)}
              </button>
            ))}
          </div>
        </div>

        <div className="goal-tip-card">
          <strong>目标会出现在哪里？</strong>
          <p>首页收入卡和统计页都会显示完成进度，帮你直观看到这个月还差多少。</p>
        </div>
      </div>
    </BottomSheet>
  );
}
