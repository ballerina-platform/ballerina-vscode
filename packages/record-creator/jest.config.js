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

// Fast L2 render tests (jsdom, no LS). Renders real components/views against COMMITTED
// fixtures captured from the real LS (see *.capture.test.ts + jest.headless-view.config.js).
// This IS the fast PR job's config (auto-discovered by reusable-build.yml as jest.config.js).
// The `.render.` suffix keeps the L4 capture/drift tests out of this fast run.

const base = require('@wso2/test-config/jest-preset');

module.exports = {
    ...base,
    rootDir: '.',
    testMatch: ['**/*.render.test.tsx'],
};
