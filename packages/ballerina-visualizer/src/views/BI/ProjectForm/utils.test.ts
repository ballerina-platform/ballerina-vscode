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

// L1: the submit gate of the Add-to-project form — what enables its one button.
//
// The rule throughout: a field blocks submit only when that flow actually shows it.
// Blocking on a hidden field leaves the button dead with nothing on screen to fix.

import { AddProjectFormData } from "./types";
import { isFormValidAddProject } from "./utils";

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
