import { useEffect, useRef, useState } from 'react';
import {
  clampNumber,
  formatNumberText,
  parseNumberText,
  sanitizeNumberText,
} from '../numberText';

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  inputMode?: 'numeric' | 'decimal';
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  /** 值不合法时标记给读屏软件 */
  invalid?: boolean;
  /** 数值为 0 时留空显示，适合“没填就是 0”的金额输入 */
  emptyWhenZero?: boolean;
}

/**
 * 数字输入不能每次按键都把格式化后的值写回输入框：
 * `type="number"` 会把正在输入的「12.」判为非法并清空，受控回写则会把「12.5」先截成 12 再变成 125。
 * 这里用文本输入 + 手动过滤：文本原样保留，数值实时解析并夹取。
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  inputMode,
  className,
  placeholder,
  ariaLabel,
  invalid = false,
  emptyWhenZero = false,
}: NumberInputProps) {
  const [text, setText] = useState(() => formatNumberText(value, emptyWhenZero));
  const lastEmitted = useRef(value);
  const focused = useRef(false);
  const allowNegative = min !== undefined && min < 0;

  useEffect(() => {
    // 输入过程中只有“外部改了值”才同步文本，避免打断用户输入
    if (focused.current && value === lastEmitted.current) return;
    lastEmitted.current = value;
    setText(formatNumberText(value, emptyWhenZero));
  }, [value, emptyWhenZero]);

  const handleChange = (raw: string) => {
    const next = sanitizeNumberText(raw, allowNegative);
    setText(next);
    const numeric = clampNumber(parseNumberText(next) ?? 0, min, max);
    lastEmitted.current = numeric;
    onChange(numeric);
  };

  return (
    <input
      type="text"
      inputMode={inputMode}
      autoComplete="off"
      className={className}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      value={text}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        setText(formatNumberText(value, emptyWhenZero));
      }}
      onChange={(event) => handleChange(event.target.value)}
    />
  );
}
