/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

// L3-tier "headless view" tests: render a real webview view (jsdom) whose rpc-client
// is wired to the REAL language server via the L3 harness — the full loop, no VSCode,
// no captured fixtures. Spawns a real LS (needs Java + a Ballerina distribution) and
// auto-skips otherwise. Filename is NOT `jest.config.js`, so the fast PR job never
// picks it up. Run with: pnpm run test:headless-view

const base = require('@wso2/test-config/jest-preset');

module.exports = {
    ...base,
    rootDir: '.',
    // L3-tier fixture capture / drift checks (spawn the real LS). Kept separate from the
    // fast render tests by the `.capture.` suffix.
    testMatch: ['**/*.capture.test.ts'],
    testTimeout: 120000,
};
