import { useRef, type CSSProperties } from 'react';
import type { ShiftTemplate, ThemePreference } from '../types';
import { isNativeApp } from '../native';
import { REMINDER_LEAD_OPTIONS } from '../reminders';
import type { ReminderStatus } from '../reminderService';
import { useClock } from '../useClock';
import {
  formatDuration,
  formatMoney,
  isOvernight,
  workedMinutes,
} from '../utils';
import {
  BellIcon,
  BriefcaseIcon,
  ChevronRightIcon,
  ClockIcon,
  DownloadIcon,
  InfoIcon,
  LogoMark,
  MoonIcon,
  PlusIcon,
  SunIcon,
  TargetIcon,
  TrashIcon,
  UploadIcon,
} from './Icons';

interface SettingsProps {
  templates: ShiftTemplate[];
  recordCount: number;
  monthlyGoal: number;
  theme: ThemePreference;
  resolvedTheme: 'light' | 'dark';
  lastBackupAt: number | null;
  onAddTemplate: () => void;
  onEditTemplate: (template: ShiftTemplate) => void;
  onEditGoal: () => void;
  onThemeChange: (theme: ThemePreference) => void;
  reminder: ReminderStatus & { enabled: boolean; leadMinutes: number };
  onToggleReminder: () => void;
  onReminderLeadChange: (minutes: number) => void;
  onRequestExactAlarm: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onImportFile: (file: File) => void;
  onClearRecords: () => void;
  installAvailable: boolean;
  onInstall: () => void;
  isStandalone: boolean;
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

function describeBackup(lastBackupAt: number | null, now: number): string {
  if (!lastBackupAt) return '尚未备份';
  const days = Math.floor((now - lastBackupAt) / 86_400_000);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 30) return `${days} 天前`;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(lastBackupAt);
}

export function Settings({
  templates,
  recordCount,
  monthlyGoal,
  theme,
  resolvedTheme,
  lastBackupAt,
  onAddTemplate,
  onEditTemplate,
  onEditGoal,
  onThemeChange,
  reminder,
  onToggleReminder,
  onReminderLeadChange,
  onRequestExactAlarm,
  onExportJson,
  onExportCsv,
  onImportFile,
  onClearRecords,
  installAvailable,
  onInstall,
  isStandalone,
}: SettingsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { timestamp: now } = useClock();
  const native = isNativeApp();
  const backupStale = !lastBackupAt || now - lastBackupAt > 30 * 86_400_000;
  const reminderLeadLabel =
    REMINDER_LEAD_OPTIONS.find((option) => option.minutes === reminder.leadMinutes)?.label ??
    `${reminder.leadMinutes} 分钟`;

  return (
    <div className="screen settings-screen">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">PREFERENCES</p>
          <h1>设置</h1>
        </div>
        <p className="page-sub">你的班次，你的规矩。</p>
      </header>

      {!isStandalone ? (
        <section className="install-card">
          <div className="install-mark">
            <LogoMark size={44} />
          </div>
          <div className="install-copy">
            <h2>装到手机上</h2>
            <p>像 App 一样打开，离线也能记账。</p>
          </div>
          {installAvailable ? (
            <button type="button" className="install-button" onClick={onInstall}>
              安装
            </button>
          ) : (
            <p className="install-hint">浏览器菜单 →「添加到主屏幕」</p>
          )}
        </section>
      ) : null}

      <section className="settings-section">
        <div className="settings-heading">
          <div>
            <h2>班次与计薪</h2>
            <p>每种班次可以设置独立的时薪和加班规则</p>
          </div>
        </div>
        <div className="settings-group">
          {templates.map((template) => {
            const minutes = workedMinutes(template.start, template.end, template.breakMinutes);
            return (
              <button
                key={template.id}
                type="button"
                className="settings-row template-row"
                onClick={() => onEditTemplate(template)}
              >
                <span
                  className="template-icon"
                  style={{ '--shift-color': template.color } as CSSProperties}
                  aria-hidden="true"
                >
                  <BriefcaseIcon size={19} />
                </span>
                <span className="settings-row-main">
                  <span className="settings-row-title">{template.name}</span>
                  <span className="settings-row-sub">
                    {template.start} – {template.end}
                    {isOvernight(template.start, template.end) ? ' 次日' : ''} ·{' '}
                    {formatDuration(minutes)}
                    {template.overtime
                      ? ` · 加班 ${template.overtime.multiplier}×`
                      : ''}
                  </span>
                </span>
                <span className="template-rate">
                  ¥{template.rate}
                  <small>/时</small>
                </span>
                <ChevronRightIcon size={17} className="row-chevron" />
              </button>
            );
          })}
          <button type="button" className="settings-row add-template-row" onClick={onAddTemplate}>
            <span className="add-template-icon">
              <PlusIcon size={18} />
            </span>
            <span className="settings-row-main">
              <span className="settings-row-title">新增班次</span>
            </span>
          </button>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-heading">
          <div>
            <h2>目标与外观</h2>
            <p>给努力一个方向，也给夜班一双舒服的眼睛</p>
          </div>
        </div>
        <div className="settings-group">
          <button type="button" className="settings-row" onClick={onEditGoal}>
            <span className="action-icon">
              <TargetIcon size={19} />
            </span>
            <span className="settings-row-main">
              <span className="settings-row-title">月收入目标</span>
              <span className="settings-row-sub">
                {monthlyGoal > 0 ? `¥${formatMoney(monthlyGoal)} / 月` : '未设置，点此添加'}
              </span>
            </span>
            <ChevronRightIcon size={17} className="row-chevron" />
          </button>
          <div className="theme-setting">
            <div className="theme-setting-head">
              <span className="action-icon">
                {resolvedTheme === 'dark' ? <MoonIcon size={19} /> : <SunIcon size={19} />}
              </span>
              <span className="settings-row-main">
                <span className="settings-row-title">外观</span>
                <span className="settings-row-sub">夜间上班时可以切换到深色</span>
              </span>
            </div>
            <div className="segmented-control" role="group" aria-label="选择外观主题">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={theme === option.value ? 'is-active' : ''}
                  onClick={() => onThemeChange(option.value)}
                  aria-pressed={theme === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-heading">
          <div>
            <h2>排班提醒</h2>
            <p>到点前提醒；单个排班可单独调整</p>
          </div>
        </div>
        <div className="settings-group">
          <div className="reminder-setting">
            <div className="reminder-head">
              <span className="action-icon">
                <BellIcon size={19} />
              </span>
              <span className="settings-row-main">
                <span className="settings-row-title">系统提醒</span>
                <span className="settings-row-sub">
                  {!reminder.supported
                    ? '仅 Android App 支持系统提醒'
                    : reminder.enabled
                      ? `提前 ${reminderLeadLabel} 提醒未来排班`
                      : '开启后按设置的提前时间提醒'}
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={reminder.enabled}
                aria-label="排班提醒"
                className={`switch${reminder.enabled ? ' is-on' : ''}`}
                onClick={onToggleReminder}
                disabled={!reminder.supported}
              >
                <span aria-hidden="true" />
              </button>
            </div>

            {reminder.supported ? (
              reminder.enabled ? (
                <>
                  <div
                    className="segmented-control reminder-lead"
                    role="group"
                    aria-label="提醒提前时间"
                  >
                    {REMINDER_LEAD_OPTIONS.map((option) => (
                      <button
                        key={option.minutes}
                        type="button"
                        className={reminder.leadMinutes === option.minutes ? 'is-active' : ''}
                        onClick={() => onReminderLeadChange(option.minutes)}
                        aria-pressed={reminder.leadMinutes === option.minutes}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p
                    className={`reminder-status${
                      reminder.permission !== 'granted' ? ' is-warning' : ''
                    }`}
                  >
                    {reminder.permission === 'granted'
                      ? reminder.scheduled > 0
                        ? `已为未来 ${reminder.scheduled} 个排班安排提醒`
                        : '暂无未来排班，排班后会自动安排提醒'
                      : '通知权限未开启，请到系统设置中允许通知'}
                  </p>
                  {reminder.exactAlarm === 'denied' ? (
                    <div className="reminder-exact">
                      <span>精确提醒未开启，通知可能延迟几分钟</span>
                      <button
                        type="button"
                        className="text-button"
                        onClick={onRequestExactAlarm}
                      >
                        去开启
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="reminder-status">
                  按提前时间提醒未来排班；每次打开 App 会自动补齐提醒。
                </p>
              )
            ) : (
              <p className="reminder-status">
                安装 Android 版后可用；网页版关闭后无法可靠定时提醒。
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-heading">
          <div>
            <h2>数据</h2>
            <p>数据只保存在本机，建议定期备份</p>
          </div>
        </div>
        <div className="settings-group">
          <button type="button" className="settings-row action-row" onClick={onExportJson}>
            <span className="action-icon">
              <DownloadIcon size={19} />
            </span>
            <span className="settings-row-main">
              <span className="settings-row-title">导出备份</span>
              <span className="settings-row-sub">JSON 格式，含记录与排班</span>
            </span>
            <ChevronRightIcon size={17} className="row-chevron" />
          </button>
          <button type="button" className="settings-row action-row" onClick={onExportCsv}>
            <span className="action-icon">
              <DownloadIcon size={19} />
            </span>
            <span className="settings-row-main">
              <span className="settings-row-title">导出表格</span>
              <span className="settings-row-sub">CSV 格式，可用 Excel 打开</span>
            </span>
            <ChevronRightIcon size={17} className="row-chevron" />
          </button>
          <button
            type="button"
            className="settings-row action-row"
            onClick={() => fileInputRef.current?.click()}
          >
            <span className="action-icon">
              <UploadIcon size={19} />
            </span>
            <span className="settings-row-main">
              <span className="settings-row-title">导入备份</span>
              <span className="settings-row-sub">导入会覆盖当前全部数据</span>
            </span>
            <ChevronRightIcon size={17} className="row-chevron" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImportFile(file);
              event.target.value = '';
            }}
          />
        </div>
        <p className={`backup-status${backupStale ? ' is-stale' : ''}`}>
          <ClockIcon size={13} />
          上次备份：{describeBackup(lastBackupAt, now)}
          <span>{backupStale ? '建议现在导出一次' : '建议每月备份'}</span>
        </p>
        <button
          type="button"
          className="clear-button"
          onClick={onClearRecords}
          disabled={recordCount === 0}
        >
          <TrashIcon size={16} />
          清空所有记录
          {recordCount > 0 ? <span>{recordCount} 条</span> : null}
        </button>
      </section>

      <section className="about-card">
        <div className="about-title">
          <InfoIcon size={17} />
          <span>关于数据</span>
        </div>
        <p>
          {native
            ? '所有记录都保存在这台设备上，不会上传服务器。卸载 App 或清除应用数据前，请先导出备份。'
            : '所有记录保存在当前浏览器中，不会上传服务器。更换设备、清理浏览器数据前，记得先导出备份。'}
        </p>
        <span className="about-version">工时账本 · v{__APP_VERSION__}</span>
      </section>
    </div>
  );
}
