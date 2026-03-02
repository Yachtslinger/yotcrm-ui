import { defineConfig } from "@playwright/test";

const port = process.env.PORT ?? "43139";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
  },
  webServer: {
    command: `PORT=${port} HOSTNAME=127.0.0.1 npm run dev -- --hostname 127.0.0.1`,
    url: `http://127.0.0.1:${port}/campaigns`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
