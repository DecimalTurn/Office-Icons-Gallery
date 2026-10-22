const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node scripts/serve.js 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI
  }
});