import { defineConfig } from "@tarojs/cli";
import devConfig from "./dev";
import prodConfig from "./prod";

const isDevelopment = process.env.NODE_ENV === "development";
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
    "process.env.TARO_APP_ENV": JSON.stringify(process.env.TARO_APP_ENV ?? "local"),
    "process.env.TARO_APP_SUPABASE_URL": JSON.stringify(process.env.TARO_APP_SUPABASE_URL ?? ""),
    "process.env.TARO_APP_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      process.env.TARO_APP_SUPABASE_PUBLISHABLE_KEY ?? "",
    ),
  },
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
  ...(isDevelopment ? devConfig : prodConfig),
});
