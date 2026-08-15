import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "@tarojs/cli";
import devConfig from "./dev";

const projectRoot = resolve(__dirname, "../..");
const requestedNodeEnv = process.env.NODE_ENV === "production" ? "production" : "development";
// Taro does not reliably load env files for this project on its own. Node's
// loadEnvFile keeps shell values highest priority. Production intentionally
// excludes the ignored developer-local file so its configuration is portable.
const environmentFiles = requestedNodeEnv === "production"
  ? [resolve(projectRoot, ".env.production"), resolve(projectRoot, ".env")]
  : [
      resolve(projectRoot, ".env.local"),
      resolve(projectRoot, `.env.${requestedNodeEnv}`),
      resolve(projectRoot, ".env"),
    ];
for (const envFile of environmentFiles) {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

const isProductionBuild = process.env.NODE_ENV === "production" || process.env.TARO_APP_ENV === "production";
const appEnvironment = isProductionBuild
  ? "production"
  : process.env.TARO_APP_ENV ?? requestedNodeEnv;
const isDevelopment = !isProductionBuild && appEnvironment === "development";
const milestoneAssetCdn = (process.env.TARO_APP_MILESTONE_ASSET_CDN ?? "").trim().replace(/\/$/, "");
if (isProductionBuild && !milestoneAssetCdn) {
  throw new Error(
    "TARO_APP_MILESTONE_ASSET_CDN 未配置。生产构建必须提供正式里程碑插画 CDN Root。",
  );
}
const outputRoot = process.env.TARO_ENV === "h5" ? "dist/h5" : "dist/weapp";

export default defineConfig({
  projectName: "nordic-nutri-ai",
  date: "2026-07-13",
  designWidth: 375,
  deviceRatio: {
    375: 1,
    750: 2,
    828: 2.2,
  },
  sourceRoot: "src",
  outputRoot,
  framework: "react",
  compiler: "webpack5",
  plugins: ["@tarojs/plugin-platform-weapp", "@tarojs/plugin-platform-h5"],
  defineConstants: {
    "process.env.TARO_APP_ENV": JSON.stringify(appEnvironment),
    "process.env.TARO_APP_ENABLE_REAL_AUTH": JSON.stringify(
      process.env.TARO_APP_ENABLE_REAL_AUTH ?? "false",
    ),
    "process.env.TARO_APP_USE_REAL_BACKEND": JSON.stringify(
      process.env.TARO_APP_USE_REAL_BACKEND ?? "false",
    ),
    "process.env.TARO_APP_CLOUDBASE_PUBLISHABLE_KEY": JSON.stringify(
      process.env.TARO_APP_CLOUDBASE_PUBLISHABLE_KEY ?? "",
    ),
    "process.env.TARO_APP_MILESTONE_ASSET_CDN": JSON.stringify(
      milestoneAssetCdn,
    ),
  },
  ...(isDevelopment
    ? {
        // Development keeps formal illustrations only as an offline fallback.
        // Production builds never copy these formal illustration files.
        copy: {
          // `copy.to` is resolved from the mini-program root by Taro's
          // CopyWebpackPlugin. Point it at the generated mini-program root,
          // otherwise it writes a sibling source directory that DevTools never
          // serves as `/assets/...`.
          patterns: [{ from: "src/assets/images/milestones", to: `${outputRoot}/assets/images/milestones` }],
          options: {},
        },
      }
    : {}),
  mini: {
    postcss: {
      pxtransform: { enable: true },
      url: { enable: true, config: { limit: 1024 } },
      cssModules: { enable: false },
    },
  },
  h5: {
    staticDirectory: "static",
  },
  ...(isDevelopment ? devConfig : {}),
});
