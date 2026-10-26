import type { Tab } from '../types';
import { CalendarIcon, ChartIcon, NotebookIcon, SettingsIcon } from './Icons';

interface BottomNavProps {
  tab: Tab;
  activeTiming?: boolean;
  timingPaused?: boolean;
  onChange: (tab: Tab) => void;
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
}: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="主导航">
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
