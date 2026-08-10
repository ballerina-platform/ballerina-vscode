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

// L0 static/contract tests. `@wso2/ballerina-core` is ~95% compile-time-only
// type declarations (nothing to execute); the runtime-testable surface is the
// enum discriminants shared across the LS/RPC wire. Node environment (no DOM),
// so it does NOT use the jsdom preset in @wso2/test-config. Filename is
// `jest.config.js` so the fast-tests CI job auto-discovers it. See docs/TEST_PLAN.md
// (L0) and docs/TEST_COVERAGE_MAP.md.

module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/src/test'],
    transform: {
        '^.+\\.ts$': ['ts-jest', {
            isolatedModules: true,
            tsconfig: { esModuleInterop: true, resolveJsonModule: true, strictNullChecks: false },
        }],
    },
    moduleFileExtensions: ['ts', 'js', 'json', 'node'],
    testMatch: ['**/?(*.)+(spec|test).ts'],
    collectCoverageFrom: [
        'src/interfaces/**/*.ts',
        '!src/**/*.d.ts',
    ],
};
