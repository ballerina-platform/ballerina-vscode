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

// Host-side fast tests (L1 pure logic + L3 RPC/LS contract). Node environment,
// no VSCode spawn — `vscode` is mocked. Scoped to src/test-support so it never
// picks up the VSCode-spawning mocha suite under test/. See docs/TEST_PLAN.md (L3).

module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/src/test-support'],
    // LS-integration (L4) tests run in their own job/config — they spawn a real LS.
    testPathIgnorePatterns: ['/node_modules/', '/ls-integration/'],
    transform: {
        '^.+\\.ts$': ['ts-jest', {
            isolatedModules: true,
            tsconfig: { esModuleInterop: true, resolveJsonModule: true, strictNullChecks: false },
        }],
    },
    moduleFileExtensions: ['ts', 'js', 'json', 'node'],
    testMatch: ['**/?(*.)+(spec|test).ts'],
    moduleNameMapper: {
        '^vscode$': '<rootDir>/src/test-support/__mocks__/vscode.ts',
    },
    transformIgnorePatterns: ['<rootDir>/node_modules/(?!(@wso2)/)'],
    collectCoverageFrom: [
        'src/test-support/**/*.ts',
        '!src/test-support/**/*.test.ts',
        '!src/test-support/__mocks__/**',
    ],
};
