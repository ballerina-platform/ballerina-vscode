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

import {
    accessSeparator,
    arrayElementType,
    isNilableAfterAccess,
    isOptionalType,
} from "./fieldAccess";

describe("isOptionalType", () => {
    it("returns false for empty input", () => {
        expect(isOptionalType(undefined)).toBe(false);
        expect(isOptionalType("")).toBe(false);
    });

    it("detects a trailing '?'", () => {
        expect(isOptionalType("string?")).toBe(true);
        expect(isOptionalType("ChangeEventMetadata?")).toBe(true);
        expect(isOptionalType("(A|B)?")).toBe(true);
    });

    it("detects an explicit nil union '|()'", () => {
        expect(isOptionalType("string|()")).toBe(true);
        expect(isOptionalType("Foo | ( )")).toBe(true);
    });

    it("ignores surrounding whitespace", () => {
        expect(isOptionalType("  string?  ")).toBe(true);
    });

    it("returns false for non-optional types", () => {
        expect(isOptionalType("string")).toBe(false);
        expect(isOptionalType("Foo")).toBe(false);
    });

    it("does not treat a nilable array element as an optional array", () => {
        // The trailing '?' belongs to the element, not the whole type.
        expect(isOptionalType("Foo?[]")).toBe(false);
    });
});

describe("accessSeparator", () => {
    it("uses '.' when neither the parent nor the hint is nilable", () => {
        expect(accessSeparator(false, undefined)).toBe(".");
        expect(accessSeparator(undefined, undefined)).toBe(".");
        expect(accessSeparator(false, ".field")).toBe(".");
        expect(accessSeparator(false, "field")).toBe(".");
    });

    it("uses '?.' when the parent value is nilable", () => {
        expect(accessSeparator(true, undefined)).toBe("?.");
        expect(accessSeparator(true, ".field")).toBe("?.");
    });

    it("uses '?.' when the completion hint starts with '?.'", () => {
        expect(accessSeparator(false, "?.field")).toBe("?.");
    });
});

describe("isNilableAfterAccess", () => {
    it("is nilable when the access itself used optional chaining", () => {
        expect(isNilableAfterAccess(true, undefined)).toBe(true);
        expect(isNilableAfterAccess(true, "string")).toBe(true);
    });

    it("is nilable when the resulting type is optional", () => {
        expect(isNilableAfterAccess(false, "string?")).toBe(true);
        expect(isNilableAfterAccess(false, "string|()")).toBe(true);
    });

    it("is not nilable for a non-optional access to a non-optional type", () => {
        expect(isNilableAfterAccess(false, undefined)).toBe(false);
        expect(isNilableAfterAccess(false, "string")).toBe(false);
    });
});

describe("arrayElementType", () => {
    it("returns undefined for empty or non-array types", () => {
        expect(arrayElementType(undefined)).toBeUndefined();
        expect(arrayElementType("")).toBeUndefined();
        expect(arrayElementType("string")).toBeUndefined();
        expect(arrayElementType("Foo")).toBeUndefined();
    });

    it("extracts the element type of a plain array", () => {
        expect(arrayElementType("Foo[]")).toBe("Foo");
        expect(arrayElementType("string[]")).toBe("string");
    });

    it("strips array-level optionality (the array is optional, not the element)", () => {
        expect(arrayElementType("Foo[]?")).toBe("Foo");
    });

    it("preserves element-level optionality (nullable array elements)", () => {
        expect(arrayElementType("Foo?[]")).toBe("Foo?");
        expect(arrayElementType("int?[]")).toBe("int?");
    });

    it("unwraps an intersection-qualified array", () => {
        expect(arrayElementType("Foo[] & readonly")).toBe("Foo");
    });

    it("ignores surrounding whitespace", () => {
        expect(arrayElementType("  Foo[]?  ")).toBe("Foo");
    });

    it("composes with isOptionalType to distinguish array vs element optionality", () => {
        // Optional array of non-nilable elements -> indexed element is not nilable.
        expect(isOptionalType(arrayElementType("Foo[]?"))).toBe(false);
        // Array of nilable elements -> indexed element is nilable.
        expect(isOptionalType(arrayElementType("Foo?[]"))).toBe(true);
    });
});
