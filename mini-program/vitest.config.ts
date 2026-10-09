import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/android-push-service-wiring.test.mjs",
      "**/android-secure-storage.test.mjs",
    ],
  },
});
