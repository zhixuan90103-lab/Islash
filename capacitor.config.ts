import type { CapacitorConfig } from '@capacitor/cli';

/**
 * iOS portrait game shell:
 * - contentInset never → Safe Area only via CSS env() / --safe-*
 * - base './' on Vite → relative assets for offline WebView
 */
const config: CapacitorConfig = {
  appId: 'com.wangzhixuan.islash.cut',
  appName: 'Islash Cut',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'never',
    preferredContentMode: 'mobile',
    backgroundColor: '#0b1020',
    scrollEnabled: false,
  },
};

export default config;
