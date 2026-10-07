const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  timeout: 60000,
  reporter: 'list',
});
