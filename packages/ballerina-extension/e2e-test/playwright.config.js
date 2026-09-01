"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
exports.default = (0, test_1.defineConfig)({
    testDir: './e2e-playwright-tests',
    testMatch: 'test.list.ts',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.BI_E2E_RETRIES ? Number(process.env.BI_E2E_RETRIES) : 2,
    maxFailures: 10,
    workers: 1,
    reporter: [['html'], ['json', { outputFile: '../e2e-reports/e2e-results.json' }]],
    use: {
        trace: 'on-first-retry',
    },
    timeout: 1200000,
});
