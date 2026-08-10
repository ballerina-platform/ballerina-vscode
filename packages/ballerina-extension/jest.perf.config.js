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

// L5 performance benchmarks (*.perf.ts). Separate config so they never run in the
// fast PR job (filename is not `jest.config.js`). Run with: pnpm run test:perf

module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/src/test-support/perf'],
    transform: {
        '^.+\\.ts$': ['ts-jest', {
            isolatedModules: true,
            tsconfig: { esModuleInterop: true, resolveJsonModule: true, strictNullChecks: false },
        }],
    },
    moduleFileExtensions: ['ts', 'js', 'json', 'node'],
    testMatch: ['**/*.perf.ts'],
    testTimeout: 180000,
};
