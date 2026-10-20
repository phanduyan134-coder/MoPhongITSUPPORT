import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1,
  use: { baseURL: "http://127.0.0.1:3100", browserName: "chromium", screenshot: "only-on-failure" },
  webServer: { command: "npm run dev -- --port 3100", url: "http://127.0.0.1:3100", env: { SUPPORTLAB_DIST_DIR: ".next-e2e", SUPPORTLAB_AI_ENABLED: "false" }, reuseExistingServer: false, timeout: 120_000 },
});
