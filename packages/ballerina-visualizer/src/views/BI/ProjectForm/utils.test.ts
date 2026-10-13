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

// L1: validation for the Add-to-project form — the individual field validators (U03) and
// the submit gate they feed.
//
// The rule throughout: a field blocks submit only when that flow actually shows it.
// Blocking on a hidden field leaves the button dead with nothing on screen to fix.

import { AddProjectFormData } from "./types";
import {
    COMPONENT_NAME_MAX_LENGTH,
    PROJECT_HANDLE_MAX_LENGTH,
    isFormValidAddProject,
    sanitizePackageName,
    sanitizeProjectHandle,
    validateComponentName,
    validateOrgName,
    validatePackageName,
    validateProjectHandle,
} from "./utils";

/** A valid form; each test makes exactly one field invalid. */
const VALID: AddProjectFormData = {
    integrationName: "MyIntegration",
    packageName: "my_integration",
    workspaceName: "MyProject",
    orgName: "myorg",
    version: "0.1.0",
    isLibrary: false,
};

const form = (overrides: Partial<AddProjectFormData> = {}): AddProjectFormData => ({ ...VALID, ...overrides });

// The three flows the single submit button serves.
/** Converting the open integration into a project, adding nothing new. */
const plainConvert = (data: AddProjectFormData) => isFormValidAddProject(data, false, false);
/** Same convert, with "Also add a new integration or library" ticked. */
const convertAndAdd = (data: AddProjectFormData) => isFormValidAddProject(data, false, true);
/** Already inside a project, adding an integration or library to it. */
const inProjectAdd = (data: AddProjectFormData) => isFormValidAddProject(data, true, false);

describe("isFormValidAddProject", () => {
    it("allows a valid form in every flow", () => {
        expect(plainConvert(form())).toBe(true);
        expect(convertAndAdd(form())).toBe(true);
        expect(inProjectAdd(form())).toBe(true);
    });

    describe("integration or library name", () => {
        it("blocks when empty while adding one", () => {
            expect(convertAndAdd(form({ integrationName: "" }))).toBe(false);
            expect(inProjectAdd(form({ integrationName: "" }))).toBe(false);
        });

        it("ignores it on a plain convert, which adds nothing", () => {
            expect(plainConvert(form({ integrationName: "" }))).toBe(true);
        });
    });

    describe("package name", () => {
        it("blocks when empty while adding one", () => {
            expect(inProjectAdd(form({ packageName: "" }))).toBe(false);
        });

        it("blocks when it has illegal characters", () => {
            expect(convertAndAdd(form({ packageName: "Not-A-Package" }))).toBe(false);
        });

        it("ignores it on a plain convert, which shows no package field", () => {
            expect(plainConvert(form({ packageName: "" }))).toBe(true);
        });
    });

    describe("organization", () => {
        it("blocks when empty while adding one", () => {
            expect(convertAndAdd(form({ orgName: "" }))).toBe(false);
        });

        it("blocks a reserved organization name", () => {
            expect(inProjectAdd(form({ orgName: "ballerina" }))).toBe(false);
        });

        it("ignores it on a plain convert, which shows no organization field", () => {
            // Resolved rather than typed, so it stays "" if the lookup fails while
            // signed out. Empty is sent as `undefined` and defaults host-side.
            expect(plainConvert(form({ orgName: "" }))).toBe(true);
        });
    });

    describe("project name", () => {
        it("blocks when empty while converting", () => {
            expect(plainConvert(form({ workspaceName: "" }))).toBe(false);
            expect(convertAndAdd(form({ workspaceName: "" }))).toBe(false);
        });

        it("ignores it inside an existing project, which shows no project name", () => {
            expect(inProjectAdd(form({ workspaceName: "" }))).toBe(true);
        });
    });

    describe("project handle", () => {
        it("blocks an invalid handle", () => {
            expect(plainConvert(form({ projectHandle: "-bad-handle" }))).toBe(false);
        });

        it("allows a valid handle", () => {
            expect(plainConvert(form({ projectHandle: "good-handle" }))).toBe(true);
        });
    });

    describe("library instead of integration", () => {
        it("allows a valid library form", () => {
            expect(inProjectAdd(form({ isLibrary: true }))).toBe(true);
        });

        it("blocks when the library name is empty", () => {
            expect(inProjectAdd(form({ isLibrary: true, integrationName: "" }))).toBe(false);
        });
    });
});

/** Validators return null for "valid", so a boolean reads better in a table. */
const accepted = (result: string | null) => result === null;

describe("validateComponentName", () => {
    it.each([
        ["a plain name", "orders"],
        ["digits after the first letter", "orders2"],
        ["spaces", "order processing"],
        ["hyphens and underscores", "order-processing_v2"],
        ["exactly the maximum length", "a".repeat(COMPONENT_NAME_MAX_LENGTH)],
    ])("accepts %s", (_label, name) => {
        expect(accepted(validateComponentName(name, false))).toBe(true);
    });

    it.each([
        ["empty", ""],
        ["a leading digit", "2orders"],
        ["a leading hyphen", "-orders"],
        ["special characters", "orders!"],
        ["a dot, which belongs to package names", "orders.v2"],
        ["shorter than three characters", "ab"],
        ["longer than the maximum", "a".repeat(COMPONENT_NAME_MAX_LENGTH + 1)],
    ])("rejects %s", (_label, name) => {
        expect(accepted(validateComponentName(name, false))).toBe(false);
    });

    // The only difference between the two flavours is the noun in the message, so a library
    // name must be judged by exactly the same rules.
    it("applies the same rules to libraries, naming them in the message", () => {
        expect(accepted(validateComponentName("utils", true))).toBe(true);
        expect(validateComponentName("ab", true)).toContain("Library");
        expect(validateComponentName("ab", false)).toContain("Integration");
    });
});

describe("validatePackageName", () => {
    it.each([
        ["lowercase letters", "orders"],
        ["digits", "orders2"],
        ["a single underscore", "order_processing"],
        ["a single dot", "orders.api"],
    ])("accepts %s", (_label, name) => {
        expect(accepted(validatePackageName(name, "orders"))).toBe(true);
    });

    it.each([
        ["empty while the integration is named", ""],
        ["uppercase letters", "Orders"],
        ["hyphens", "order-processing"],
        ["spaces", "order processing"],
        ["a leading underscore", "_orders"],
        ["consecutive underscores", "order__processing"],
        ["consecutive dots", "orders..api"],
        ["a trailing underscore", "orders_"],
        ["a trailing dot", "orders."],
        ["a single character", "o"],
    ])("rejects %s", (_label, name) => {
        expect(accepted(validatePackageName(name, "orders"))).toBe(false);
    });

    // The package name is derived from the integration name, so an empty pair is the untouched
    // initial state of the form rather than something to complain about.
    it("accepts an empty package name only while the integration is also unnamed", () => {
        expect(accepted(validatePackageName("", ""))).toBe(true);
        expect(accepted(validatePackageName("", "orders"))).toBe(false);
    });
});

describe("validateOrgName", () => {
    it.each([
        ["a plain name", "acme"],
        ["digits after the first letter", "acme2"],
        ["an underscore between words", "acme_corp"],
        ["uppercase letters", "AcmeCorp"],
    ])("accepts %s", (_label, name) => {
        expect(accepted(validateOrgName(name))).toBe(true);
    });

    it.each([
        ["empty", ""],
        ["a leading digit", "2acme"],
        ["hyphens", "acme-corp"],
        ["consecutive underscores", "acme__corp"],
        ["a trailing underscore", "acme_"],
    ])("rejects %s", (_label, name) => {
        expect(accepted(validateOrgName(name))).toBe(false);
    });

    // Publishing under these would collide with the platform's own packages.
    it.each([["ballerina"], ["ballerinax"], ["wso2"], ["Ballerina"], ["WSO2"]])(
        "rejects the reserved org name %s whatever its casing",
        (name) => {
            expect(accepted(validateOrgName(name))).toBe(false);
        }
    );
});

describe("validateProjectHandle", () => {
    it.each([
        ["lowercase letters", "orders"],
        ["digits", "orders2"],
        ["hyphens between words", "order-processing"],
        ["two characters", "ab"],
        ["exactly the maximum length", "a".repeat(PROJECT_HANDLE_MAX_LENGTH)],
    ])("accepts %s", (_label, handle) => {
        expect(accepted(validateProjectHandle(handle))).toBe(true);
    });

    it.each([
        ["empty", ""],
        ["a leading hyphen", "-orders"],
        ["uppercase letters", "Orders"],
        ["underscores", "order_processing"],
        ["a single character", "a"],
        ["a trailing hyphen", "orders-"],
        ["longer than the maximum", "a".repeat(PROJECT_HANDLE_MAX_LENGTH + 1)],
    ])("rejects %s", (_label, handle) => {
        expect(accepted(validateProjectHandle(handle))).toBe(false);
    });
});

// The other half of U03: a name the user types is not rejected outright but resolved into a
// legal one. Each sanitiser's output must itself pass the matching validator, which is the
// property worth pinning — the exact substitution is an implementation detail.
describe("sanitisers produce values their own validator accepts", () => {
    it.each([
        ["spaces", "order processing"],
        ["hyphens", "order-processing"],
        ["uppercase", "OrderProcessing"],
        ["consecutive separators", "order___processing"],
        ["consecutive dots", "orders...api"],
    ])("sanitizePackageName resolves %s", (_label, raw) => {
        const sanitized = sanitizePackageName(raw);

        expect(accepted(validatePackageName(sanitized, "orders"))).toBe(true);
    });

    it.each([
        ["spaces", "Order Processing"],
        ["underscores", "order_processing"],
        ["special characters", "orders!!!"],
        ["a leading separator", " orders"],
        ["a trailing separator", "orders "],
        ["something longer than the limit", "a".repeat(PROJECT_HANDLE_MAX_LENGTH + 20)],
    ])("sanitizeProjectHandle resolves %s", (_label, raw) => {
        const sanitized = sanitizeProjectHandle(raw);

        expect(accepted(validateProjectHandle(sanitized))).toBe(true);
    });
});
