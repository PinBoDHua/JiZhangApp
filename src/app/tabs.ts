import type { Tab } from '../types';

/**
 * 标签页中文名。
 * 底栏按钮与页面级错误边界都要用它，放在独立模块里：
 * 一是避免两处文案各自演化，二是让组件文件只导出组件（Fast Refresh 要求）。
 */
export const TAB_LABELS: Record<Tab, string> = {
  home: '记录',
  calendar: '日历',
  stats: '统计',
  settings: '设置',
};
