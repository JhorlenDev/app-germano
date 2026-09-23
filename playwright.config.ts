import { defineConfig } from "@playwright/test";
import { loadEnvFile } from "node:process";
loadEnvFile(".env");
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 60000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
