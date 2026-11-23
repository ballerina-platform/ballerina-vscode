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

// Reads the CSS that emotion declared for an element. jsdom's getComputedStyle drops values it
// cannot evaluate (min(), calc(), vh) and properties it does not know (scrollbar-gutter), so these
// helpers read the matching rules as written instead.

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The value `property` is declared with in the last stylesheet rule that matches `element`, or
 * undefined if no rule declares it. With `pseudoElement` (e.g. "::-webkit-scrollbar"), reads the
 * rules for that pseudo-element of `element` instead.
 */
export const declaredValue = (element: Element, property: string, pseudoElement = ""): string | undefined => {
    const declaration = new RegExp(`(?:^|[\\s;{])${escapeRegExp(property)}\\s*:\\s*([^;}]+)`);
    let value: string | undefined;
    for (const sheet of Array.from(document.styleSheets)) {
        for (const rule of Array.from(sheet.cssRules)) {
            if (!(rule instanceof CSSStyleRule)) {
                continue;
            }
            const selectors = rule.selectorText.split(",").map((selector) => selector.trim());
            const matches = selectors.some((selector) =>
                pseudoElement
                    ? selector.endsWith(pseudoElement) && element.matches(selector.slice(0, -pseudoElement.length))
                    : !selector.includes("::") && element.matches(selector)
            );
            const found = matches ? declaration.exec(rule.cssText) : null;
            if (found) {
                value = found[1].trim();
            }
        }
    }
    return value;
};

/**
 * Resolves a CSS length to pixels at the given viewport height. Supports px and vh units,
 * + - * /, parentheses, and calc(), min(), max() and clamp(). Without a viewport height, a vh
 * length is an error.
 */
export const resolveLength = (css: string, viewportHeight?: number): number => {
    const tokens = css.match(/\d*\.?\d+(?:px|vh)?|[a-z-]+\(|[()+\-*/,]/g) ?? [];
    let position = 0;
    const next = (): string => {
        if (position >= tokens.length) {
            throw new Error(`Unexpected end of "${css}"`);
        }
        return tokens[position++];
    };
    const expect = (token: string) => {
        if (next() !== token) {
            throw new Error(`Expected "${token}" in "${css}"`);
        }
    };
    const args = (): number[] => {
        const values = [sum()];
        while (tokens[position] === ",") {
            position++;
            values.push(sum());
        }
        expect(")");
        return values;
    };
    const operand = (): number => {
        const token = next();
        switch (token) {
            case "-":
                return -operand();
            case "(":
            case "calc(": {
                const value = sum();
                expect(")");
                return value;
            }
            case "min(":
                return Math.min(...args());
            case "max(":
                return Math.max(...args());
            case "clamp(": {
                const [lower, preferred, upper] = args();
                return Math.max(lower, Math.min(preferred, upper));
            }
        }
        if (!/^\d*\.?\d+(px|vh)?$/.test(token)) {
            throw new Error(`Cannot resolve "${token}" in "${css}"`);
        }
        const number = parseFloat(token);
        if (!token.endsWith("vh")) {
            return number;
        }
        if (viewportHeight === undefined) {
            throw new Error(`"${css}" depends on the viewport height`);
        }
        return (number * viewportHeight) / 100;
    };
    const product = (): number => {
        let value = operand();
        while (tokens[position] === "*" || tokens[position] === "/") {
            const operator = next();
            const right = operand();
            value = operator === "*" ? value * right : value / right;
        }
        return value;
    };
    const sum = (): number => {
        let value = product();
        while (tokens[position] === "+" || tokens[position] === "-") {
            const operator = next();
            const right = product();
            value = operator === "+" ? value + right : value - right;
        }
        return value;
    };
    const value = sum();
    if (position !== tokens.length) {
        throw new Error(`Unexpected "${tokens[position]}" in "${css}"`);
    }
    return value;
};
