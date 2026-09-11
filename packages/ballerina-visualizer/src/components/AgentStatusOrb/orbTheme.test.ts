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
 *
 * @jest-environment node
 */

import {
    ambientBorderColor,
    deriveOrbColors,
    hexToRgb,
    hslToRgb,
    resolveCssColorToHex,
    rgbToHex,
    rgbToHsl,
    shiftLightness,
    stateColorVar,
    subscribeToThemeChanges,
} from "./orbTheme";

describe("hexToRgb", () => {
    it("parses #rrggbb (any case)", () => {
        expect(hexToRgb("#ffffff")).toEqual([255, 255, 255]);
        expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
        expect(hexToRgb("#5567D5")).toEqual([85, 103, 213]);
    });

    it("expands #rgb shorthand", () => {
        expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
        expect(hexToRgb("#0a0")).toEqual([0, 170, 0]);
    });
});

describe("rgbToHex", () => {
    it("formats and clamps", () => {
        expect(rgbToHex([85, 103, 213])).toBe("#5567d5");
        expect(rgbToHex([300, -5, 128])).toBe("#ff0080");
    });
});

describe("rgb <-> hsl round trip", () => {
    it("recovers the original rgb within rounding", () => {
        for (const rgb of [[85, 103, 213], [255, 0, 0], [16, 200, 120], [128, 128, 128]] as [number, number, number][]) {
            const [r, g, b] = hslToRgb(rgbToHsl(rgb)).map(Math.round);
            expect(Math.abs(r - rgb[0])).toBeLessThanOrEqual(1);
            expect(Math.abs(g - rgb[1])).toBeLessThanOrEqual(1);
            expect(Math.abs(b - rgb[2])).toBeLessThanOrEqual(1);
        }
    });
});

describe("shiftLightness", () => {
    it("lightens and darkens while keeping hue", () => {
        const base = "#5567d5";
        const lighter = shiftLightness(base, 0.15);
        const darker = shiftLightness(base, -0.15);
        expect(rgbToHsl(hexToRgb(lighter))[2]).toBeGreaterThan(rgbToHsl(hexToRgb(base))[2]);
        expect(rgbToHsl(hexToRgb(darker))[2]).toBeLessThan(rgbToHsl(hexToRgb(base))[2]);
        // Hue is preserved (same family), within rounding.
        expect(Math.abs(rgbToHsl(hexToRgb(lighter))[0] - rgbToHsl(hexToRgb(base))[0])).toBeLessThan(2);
    });

    it("clamps at the extremes instead of overflowing", () => {
        const nearWhite = hexToRgb(shiftLightness("#ffffff", 0.5));
        const nearBlack = hexToRgb(shiftLightness("#000000", -0.5));
        expect(nearWhite.every((c) => c > 0 && c < 255)).toBe(true);
        expect(nearBlack.every((c) => c > 0 && c < 255)).toBe(true);
    });
});

describe("stateColorVar", () => {
    it("maps idle to the primary accent, running to the progress-bar token, and the transient states to semantic tokens", () => {
        expect(stateColorVar("idle")).toBe("var(--vscode-button-background)");
        expect(stateColorVar("running")).toBe("var(--vscode-progressBar-background, var(--vscode-button-background))");
        expect(stateColorVar("awaiting-input")).toContain("--vscode-charts-yellow");
        expect(stateColorVar("completed")).toBe("var(--vscode-charts-green)");
        expect(stateColorVar("error")).toContain("--vscode-errorForeground");
    });
});

describe("ambientBorderColor", () => {
    it("floors the accent states toward focusBorder so the frame stays visible", () => {
        for (const state of ["idle", "running"] as const) {
            const c = ambientBorderColor(state);
            expect(c).toContain("--vscode-button-background");
            expect(c).toContain("--vscode-focusBorder");
        }
    });

    it("leaves the vivid semantic states pure (no focusBorder blend)", () => {
        for (const state of ["awaiting-input", "completed", "error"] as const) {
            expect(ambientBorderColor(state)).toBe(stateColorVar(state));
        }
    });
});

const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
const computedStyleDescriptor = Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle");
const mutationObserverDescriptor = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");

function restoreGlobalProperty(name: string, descriptor?: PropertyDescriptor): void {
    if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
    } else {
        Reflect.deleteProperty(globalThis, name);
    }
}

afterEach(() => {
    restoreGlobalProperty("document", documentDescriptor);
    restoreGlobalProperty("getComputedStyle", computedStyleDescriptor);
    restoreGlobalProperty("MutationObserver", mutationObserverDescriptor);
});

describe("resolveCssColorToHex", () => {
    function mockComputedColor(color: string): void {
        const probe = { style: { cssText: "", color: "" }, remove: jest.fn() };
        Object.defineProperty(globalThis, "document", {
            configurable: true,
            value: {
                body: { appendChild: jest.fn() },
                createElement: jest.fn(() => probe),
            },
        });
        Object.defineProperty(globalThis, "getComputedStyle", {
            configurable: true,
            value: jest.fn(() => ({ color })),
        });
    }

    it("parses legacy and modern computed RGB syntax", () => {
        mockComputedColor("rgba(85, 103, 213, 0.5)");
        expect(resolveCssColorToHex("var(--vscode-button-background)")).toBe("#5567d5");

        mockComputedColor("rgb(85 103 213 / 0.5)");
        expect(resolveCssColorToHex("var(--vscode-button-background)")).toBe("#5567d5");
    });

    it("returns the BI fallback accent when there is no document", () => {
        restoreGlobalProperty("document");
        expect(resolveCssColorToHex("var(--vscode-button-background)")).toBe("#5567D5");
    });
});

describe("subscribeToThemeChanges", () => {
    it("shares one observer across both theme metadata roots", () => {
        const documentElement = {};
        const body = {};
        const observe = jest.fn();
        const disconnect = jest.fn();
        let callback: MutationCallback | undefined;
        class FakeMutationObserver {
            constructor(next: MutationCallback) {
                callback = next;
            }

            observe = observe;
            disconnect = disconnect;
        }
        Object.defineProperty(globalThis, "document", {
            configurable: true,
            value: { documentElement, body },
        });
        Object.defineProperty(globalThis, "MutationObserver", {
            configurable: true,
            value: FakeMutationObserver,
        });

        const firstListener = jest.fn();
        const secondListener = jest.fn();
        const unsubscribeFirst = subscribeToThemeChanges(firstListener);
        const unsubscribeSecond = subscribeToThemeChanges(secondListener);

        const options = {
            attributes: true,
            attributeFilter: ["class", "data-vscode-theme-kind", "data-vscode-theme-id", "style"],
        };
        expect(observe).toHaveBeenCalledTimes(2);
        expect(observe).toHaveBeenNthCalledWith(1, documentElement, options);
        expect(observe).toHaveBeenNthCalledWith(2, body, options);

        callback?.([], {} as MutationObserver);
        expect(firstListener).toHaveBeenCalledTimes(1);
        expect(secondListener).toHaveBeenCalledTimes(1);

        unsubscribeFirst();
        callback?.([], {} as MutationObserver);
        expect(firstListener).toHaveBeenCalledTimes(1);
        expect(secondListener).toHaveBeenCalledTimes(2);

        unsubscribeSecond();
        expect(disconnect).toHaveBeenCalledTimes(1);
    });
});

describe("deriveOrbColors", () => {
    it("produces a [darker, base, lighter] triad around the resolved base", () => {
        const [dark, base, light] = deriveOrbColors("idle"); // base falls back to #5567D5 (no DOM)
        expect(base).toBe("#5567D5");
        expect(rgbToHsl(hexToRgb(dark))[2]).toBeLessThan(rgbToHsl(hexToRgb(base))[2]);
        expect(rgbToHsl(hexToRgb(light))[2]).toBeGreaterThan(rgbToHsl(hexToRgb(base))[2]);
    });
});
