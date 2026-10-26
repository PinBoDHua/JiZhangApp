import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gongshi.ledger',
  appName: '工时账本',
  webDir: 'dist',
  android: {
    backgroundColor: '#f4f0e7',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 700,
      launchAutoHide: true,
      backgroundColor: '#f4f0e7',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#f4f0e7',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_shift',
      iconColor: '#D08A2E',
    },
  },
};

export default config;
