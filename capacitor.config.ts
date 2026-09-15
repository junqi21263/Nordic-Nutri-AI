import type { CapacitorConfig } from '@capacitor/cli';

const isLiveReload = process.env.CAPACITOR_LIVE_RELOAD === 'true';

const config: CapacitorConfig = {
  appId: 'com.lewislee.nordicnutri',
  appName: 'Nordic-Nutri-AI',
  webDir: 'mini-program/dist/h5',
  plugins: {
    PushNotifications: {
      presentationOptions: ['alert', 'badge', 'sound'],
    },
  },
  ...(isLiveReload
    ? {
        // Android Emulator exposes the host machine as 10.0.2.2.
        // This is intentionally opt-in so release APKs stay self-contained.
        server: {
          url: process.env.CAPACITOR_LIVE_RELOAD_URL ?? 'http://10.0.2.2:10086',
          cleartext: true,
        },
      }
    : {}),
};

export default config;
