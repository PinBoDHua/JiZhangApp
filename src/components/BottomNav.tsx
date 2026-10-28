import { useRef, useState } from 'react';
import { useIsomorphicLayoutEffect } from '../hooks/useIsomorphicLayoutEffect';
import type { Tab } from '../types';
import { CalendarIcon, ChartIcon, NotebookIcon, SettingsIcon } from './Icons';

interface BottomNavProps {
  tab: Tab;
  activeTiming?: boolean;
  timingPaused?: boolean;
  onChange: (tab: Tab) => void;
  /** 浮层打开时把底栏移出可交互与读屏范围 */
  inert?: boolean;
}

interface IndicatorBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const tabs: { id: Tab; label: string; Icon: typeof NotebookIcon }[] = [
  { id: 'home', label: '记录', Icon: NotebookIcon },
  { id: 'calendar', label: '日历', Icon: CalendarIcon },
  { id: 'stats', label: '统计', Icon: ChartIcon },
  { id: 'settings', label: '设置', Icon: SettingsIcon },
];

export function BottomNav({
  tab,
  activeTiming = false,
  timingPaused = false,
  onChange,
  inert = false,
}: BottomNavProps) {
  const navRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<IndicatorBox | null>(null);
  const [ready, setReady] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const item = nav.querySelector<HTMLElement>('.nav-item.is-active');
      const icon = item?.querySelector<HTMLElement>('.nav-icon');
      if (!item || !icon) return;
      const navRect = nav.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      setIndicator({
        x: itemRect.left - navRect.left + (itemRect.width - icon.offsetWidth) / 2,
        y: itemRect.top - navRect.top + icon.offsetTop,
        width: icon.offsetWidth,
        height: icon.offsetHeight,
      });
    };
    measure();
    const frame = requestAnimationFrame(() => setReady(true));
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(nav);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [tab]);

  return (
    <nav className="bottom-nav" aria-label="主导航" ref={navRef} inert={inert}>
      {indicator ? (
        <span
          className={`nav-active-pill${ready ? ' is-ready' : ''}`}
          style={{
            width: `${indicator.width}px`,
            height: `${indicator.height}px`,
            transform: `translate3d(${indicator.x}px, ${indicator.y}px, 0)`,
          }}
          aria-hidden="true"
        />
      ) : null}
      {tabs.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`nav-item${tab === id ? ' is-active' : ''}`}
          onClick={() => onChange(id)}
          aria-current={tab === id ? 'page' : undefined}
          aria-label={
            id === 'home' && activeTiming
              ? `${label}，${timingPaused ? '计时已暂停' : '计时中'}`
              : undefined
          }
        >
          <span className={`nav-icon${id === 'home' && activeTiming ? ' has-timer' : ''}`}>
            <Icon size={20} />
            {id === 'home' && activeTiming ? (
              <i
                className={`nav-timer-dot${timingPaused ? ' is-paused' : ''}`}
                aria-hidden="true"
              />
            ) : null}
          </span>
          <span className="nav-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
