export interface NativeAppInfo {
  versionCode: number;
  versionName: string;
  installerPackage: string | null;
}

export interface AndroidRelease {
  versionCode: number;
  versionName: string;
  releaseNotes: string[];
  apkUrl?: string;
  apkSha256?: string;
  marketUrl?: string;
}

export interface AppVersionResponse {
  update: AndroidRelease | null;
}

export type AppUpdateChannel = "direct" | "market";
