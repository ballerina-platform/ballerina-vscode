/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

const base = require('@wso2/test-config/jest-preset');

module.exports = {
    ...base,
    rootDir: '.',
    moduleNameMapper: {
        ...base.moduleNameMapper,
        '^http-proxy-agent$': '<rootDir>/src/test/mocks/proxyAgent.ts',
        '^https-proxy-agent$': '<rootDir>/src/test/mocks/proxyAgent.ts',
    },
    // `*.capture.test.ts` spawns a real LS — it runs via jest.realdata.config.js (nightly),
    // not the fast PR job. The fast job DOES run `*.render.test.tsx` (snapshots the
    // captured fixture, no LS).
    testPathIgnorePatterns: [...(base.testPathIgnorePatterns || ['/node_modules/']), '\\.capture\\.test\\.'],
};
