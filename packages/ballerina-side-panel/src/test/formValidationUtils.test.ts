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

// L1 (P0): form validation gating. Migrated from the legacy node:test suite
// (test/formValidationUtils.test.mjs, which ran against built lib/) to Jest against
// source. Two rules under test:
//   - shouldRunExternalFormValidation: only defer to the (expensive) external/LS
//     validation once local state is clean.
//   - hasIncompleteRequiredFormFields: a required, visible, enabled field (or a
//     required child revealed by a dynamic selection) with no value blocks submit.

import type { FormField } from "../components/Form/types";
import { hasIncompleteRequiredFormFields, shouldRunExternalFormValidation } from "../components/Form/utils";

// The functions read a handful of FormField props; build partials without dragging
// the full type into every fixture.
const field = (partial: Partial<FormField>): FormField => partial as FormField;

describe("shouldRunExternalFormValidation", () => {
    it("blocks when local form state is invalid", () => {
        expect(
            shouldRunExternalFormValidation({
                formStateIsValid: false,
                errors: { name: { type: "required", message: "Name is required" } },
            })
        ).toBe(false);
    });

    it("blocks when local errors exist", () => {
        expect(
            shouldRunExternalFormValidation({
                formStateIsValid: true,
                errors: { path: { type: "pattern", message: "Invalid path" } },
            })
        ).toBe(false);
    });

    it("permits when local validation is clean", () => {
        expect(shouldRunExternalFormValidation({ formStateIsValid: true, errors: {} })).toBe(true);
    });

    it("blocks when required fields are incomplete", () => {
        expect(
            shouldRunExternalFormValidation({
                formStateIsValid: true,
                errors: {},
                hasIncompleteRequiredFields: true,
            })
        ).toBe(false);
    });
});

describe("hasIncompleteRequiredFormFields", () => {
    describe("flat fields", () => {
        it("true when a required string field is empty", () => {
            expect(
                hasIncompleteRequiredFormFields(
                    [field({ key: "variable", optional: false, hidden: false, enabled: true })],
                    { variable: "" }
                )
            ).toBe(true);
        });

        it("true when a required string field is whitespace", () => {
            expect(
                hasIncompleteRequiredFormFields(
                    [field({ key: "expression", optional: false, hidden: false, enabled: true })],
                    { expression: "   " }
                )
            ).toBe(true);
        });

        it("true when a required array field is empty", () => {
            expect(
                hasIncompleteRequiredFormFields(
                    [field({ key: "items", optional: false, hidden: false, enabled: true })],
                    { items: [] }
                )
            ).toBe(true);
        });

        it("ignores optional empty array fields", () => {
            expect(
                hasIncompleteRequiredFormFields(
                    [field({ key: "items", optional: true, hidden: false, enabled: true })],
                    { items: [] }
                )
            ).toBe(false);
        });

        it("ignores optional, hidden, and disabled empty fields", () => {
            expect(
                hasIncompleteRequiredFormFields(
                    [
                        field({ key: "optionalValue", optional: true, hidden: false, enabled: true }),
                        field({ key: "hiddenValue", optional: false, hidden: true, enabled: true }),
                        field({ key: "disabledValue", optional: false, hidden: false, enabled: false }),
                    ],
                    { optionalValue: "", hiddenValue: "", disabledValue: "" }
                )
            ).toBe(false);
        });

        it("false when required visible fields are filled", () => {
            expect(
                hasIncompleteRequiredFormFields(
                    [field({ key: "variable", optional: false, hidden: false, enabled: true })],
                    { variable: "var1" }
                )
            ).toBe(false);
        });

        const connectionField = () =>
            field({
                key: "connection",
                optional: false,
                hidden: false,
                enabled: true,
                types: [{ fieldType: "CONNECTION", selected: true } as any],
            });

        it("true when a required connection selector still holds the new-connection sentinel", () => {
            expect(
                hasIncompleteRequiredFormFields([connectionField()], { connection: "NEW_CONNECTION" })
            ).toBe(true);
        });

        it("false when a required connection selector has a real connection", () => {
            expect(
                hasIncompleteRequiredFormFields([connectionField()], { connection: "currencyClient" })
            ).toBe(false);
        });
    });

    describe("dynamic child fields", () => {
        const httpUrl = () =>
            field({
                key: "connectionType",
                optional: false,
                hidden: false,
                enabled: true,
                dynamicFormFields: {
                    HTTP: [field({ key: "url", optional: false, hidden: false, enabled: true })],
                },
            });

        it("true when a dynamic child field is empty", () => {
            expect(hasIncompleteRequiredFormFields([httpUrl()], { connectionType: "HTTP", url: "" })).toBe(true);
        });

        it("false when dynamic child fields are filled", () => {
            expect(
                hasIncompleteRequiredFormFields([httpUrl()], { connectionType: "HTTP", url: "https://example.com" })
            ).toBe(false);
        });

        it("ignores dynamic child fields when the parent is empty (parent itself required → true)", () => {
            expect(hasIncompleteRequiredFormFields([httpUrl()], { connectionType: "", url: "" })).toBe(true);
        });

        it("ignores dynamic child fields when the selection has no dynamic fields", () => {
            expect(hasIncompleteRequiredFormFields([httpUrl()], { connectionType: "FILE", url: "" })).toBe(false);
        });

        it("true when a nested dynamic child field is empty", () => {
            const nested = field({
                key: "connectionType",
                optional: false,
                hidden: false,
                enabled: true,
                dynamicFormFields: {
                    HTTP: [
                        field({
                            key: "authType",
                            optional: false,
                            hidden: false,
                            enabled: true,
                            dynamicFormFields: {
                                OAuth: [field({ key: "token", optional: false, hidden: false, enabled: true })],
                            },
                        }),
                    ],
                },
            });
            expect(
                hasIncompleteRequiredFormFields([nested], { connectionType: "HTTP", authType: "OAuth", token: "" })
            ).toBe(true);
            expect(
                hasIncompleteRequiredFormFields([nested], { connectionType: "HTTP", authType: "OAuth", token: "abc123" })
            ).toBe(false);
        });

        it("validates dynamic child fields when an optional parent has a value", () => {
            const optionalParent = field({
                key: "optionalSelector",
                optional: true,
                hidden: false,
                enabled: true,
                dynamicFormFields: {
                    selected: [field({ key: "requiredChild", optional: false, hidden: false, enabled: true })],
                },
            });
            expect(
                hasIncompleteRequiredFormFields([optionalParent], { optionalSelector: "selected", requiredChild: "" })
            ).toBe(true);
            // optional parent with no value → its dynamic children are not required
            expect(
                hasIncompleteRequiredFormFields([optionalParent], { optionalSelector: "", requiredChild: "" })
            ).toBe(false);
        });
    });
});
