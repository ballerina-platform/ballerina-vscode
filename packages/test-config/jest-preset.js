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

// Shared Jest configuration for Ballerina VSCode webview packages.
//
// Usage in a package's jest.config.js:
//
//   const base = require('@wso2/test-config/jest-preset');
//   module.exports = { ...base, rootDir: '.' };
//
// Package-specific mocks merge on top:
//
//   module.exports = {
//     ...base,
//     rootDir: '.',
//     moduleNameMapper: { ...base.moduleNameMapper, '^some-module$': '<rootDir>/src/test/mocks/x.ts' },
//   };
//
// Setup files and the asset proxy are resolved from THIS package (via __dirname)
// so every consumer shares one copy. Transforms (ts-jest/babel-jest), the jsdom
// environment and react/react-dom resolve from the CONSUMER's node_modules.

const path = require('path');

const assetProxy = path.join(__dirname, 'identity-obj-proxy.js');

module.exports = {
    preset: 'ts-jest/presets/js-with-ts',
    testEnvironment: 'jsdom',
    transform: {
        '^.+\\.(js|jsx)$': 'babel-jest',
        '^.+\\.(ts|tsx)$': 'ts-jest',
    },
    globals: {
        'ts-jest': {
            isolatedModules: true,
            tsconfig: {
                jsx: 'react',
                esModuleInterop: true,
                allowSyntheticDefaultImports: true,
            },
        },
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    testMatch: ['**/?(*.)+(spec|test).ts?(x)'],
    moduleNameMapper: {
        '^@vscode/codicons/dist/codicon.css$': assetProxy,
        '\\.(css|less|sass|scss)$': assetProxy,
        '\\.(svg|png|jpg|jpeg|gif|woff|woff2|ttf|eot)$': assetProxy,
        '^react$': '<rootDir>/node_modules/react/index.js',
        '^react-dom$': '<rootDir>/node_modules/react-dom/index.js',
    },
    setupFiles: [path.join(__dirname, 'matchMedia.js')],
    setupFilesAfterEnv: [path.join(__dirname, 'jest.env.js')],
    transformIgnorePatterns: [
        '<rootDir>/node_modules/(?!(@wso2)/)', // Only transform @wso2 packages
    ],
    collectCoverageFrom: [
        'src/**/*.{ts,tsx}',
        '!src/**/*.d.ts',
        '!src/**/*.stories.{ts,tsx}',
        '!src/test/**/*',
    ],
};
