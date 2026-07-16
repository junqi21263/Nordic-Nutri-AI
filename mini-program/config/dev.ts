import type { IProjectConfig } from "@tarojs/taro/types/compile";

export default {
  mini: {
    webpackChain(chain) {
      // Taro's watch build otherwise removes app.json before emitting the
      // replacement files, which leaves WeChat DevTools on wx://not-found.
      chain.output.set("clean", false);
    },
  },
} satisfies IProjectConfig;
