import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gongshi.ledger',
  appName: '工时账本',
  webDir: 'dist',
  android: {
    backgroundColor: '#f6f3ed',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 700,
      launchAutoHide: true,
      backgroundColor: '#f6f3ed',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#f6f3ed',
    },
    SystemBars: {
      // 边到边下由插件注入安全区变量，配合 CSS 里的 --safe-area-inset-* 使用
      insetsHandling: 'css',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_shift',
      iconColor: '#D08A2E',
    },
  },
};

export default config;
