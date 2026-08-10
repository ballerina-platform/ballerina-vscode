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

// Runs after the test framework is installed (setupFilesAfterEnv).
// Shared jsdom/browser polyfills and mocks for all webview packages.

require('@testing-library/jest-dom');

globalThis.structuredClone = globalThis.structuredClone || ((val) => JSON.parse(JSON.stringify(val)));

globalThis.setImmediate =
    globalThis.setImmediate || ((fn, ...args) => globalThis.setTimeout(fn, 0, ...args));

// jsdom does not provide the WebCrypto API; components that mint ids via
// crypto.randomUUID() (e.g. the array editor) would otherwise throw on render.
if (!globalThis.crypto) {
    globalThis.crypto = require('crypto').webcrypto;
}
if (typeof globalThis.crypto.randomUUID !== 'function') {
    globalThis.crypto.randomUUID = () => require('crypto').randomUUID();
}

class MockResizeObserver {
    observe = jest.fn();
    unobserve = jest.fn();
    disconnect = jest.fn();
}

globalThis.ResizeObserver = MockResizeObserver;

// Virtual mock: this setup file lives in @wso2/test-config, so the polyfill
// may not be resolvable from here even when the consumer depends on it.
jest.mock(
    'resize-observer-polyfill',
    () => ({
        __esModule: true,
        default: MockResizeObserver,
    }),
    { virtual: true }
);

// DOM mocks — skip in non-DOM test environments (e.g. @jest-environment node).
if (typeof Element !== 'undefined') {
    // Mock getBoundingClientRect for canvas/diagram elements.
    Element.prototype.getBoundingClientRect = jest.fn(() => ({
        width: 800,
        height: 600,
        top: 0,
        left: 0,
        bottom: 600,
        right: 800,
        x: 0,
        y: 0,
        toJSON: jest.fn(),
    }));

    // Mock canvas 2d context.
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
        fillRect: jest.fn(),
        clearRect: jest.fn(),
        getImageData: jest.fn(),
        putImageData: jest.fn(),
        createImageData: jest.fn(),
        setTransform: jest.fn(),
        drawImage: jest.fn(),
        save: jest.fn(),
        restore: jest.fn(),
        beginPath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        closePath: jest.fn(),
        stroke: jest.fn(),
        fill: jest.fn(),
        scale: jest.fn(),
        rotate: jest.fn(),
        translate: jest.fn(),
        measureText: jest.fn(() => ({ width: 10 })),
        fillStyle: '',
        strokeStyle: '',
        globalAlpha: 1,
    }));
}
