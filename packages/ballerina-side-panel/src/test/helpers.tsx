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

// Test helpers for EditorFactory / form rendering. See docs/TEST_PLAN.md (L2)
// and docs/TEST_BACKLOG.md (L2-01..).
//
// Usage in a test file:
//
//   import { mockEditors, renderField } from "../test/helpers";
//   mockEditors();                       // stub every child editor (call before rendering)
//   import { screen } from "@testing-library/react";
//
//   renderField(field, { fieldType: "ENUM" } as any);
//   expect(screen.getByTestId("DropdownEditor")).toBeInTheDocument();

import React from "react";
import { render } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import type { FormFieldEditorProps } from "../components/editors/EditorFactory";

// Every child module EditorFactory imports, mapped to its exported component names.
// Paths are relative to this file (src/test/).
export const EDITOR_MODULES: Record<string, string[]> = {
    "../components/editors/MultiSelectEditor": ["MultiSelectEditor"],
    "../components/editors/TextEditor": ["TextEditor"],
    "../components/editors/TypeEditor": ["TypeEditor"],
    "../components/editors/ExpressionEditor": ["ContextAwareExpressionEditor", "DataMapperJoinClauseRhsEditor"],
    "../components/ParamManager/ParamManager": ["ParamManagerEditor"],
    "../components/editors/DropdownEditor": ["DropdownEditor"],
    "../components/editors/FileSelect": ["FileSelect"],
    "../components/editors/CheckBoxEditor": ["CheckBoxEditor"],
    "../components/editors/ChoiceForm": ["ChoiceForm"],
    "../components/editors/FormMapEditor": ["FormMapEditor"],
    "../components/editors/TextAreaEditor": ["TextAreaEditor"],
    "../components/editors/DropdownChoiceForm": ["DropdownChoiceForm"],
    "../components/editors/IdentifierEditor": ["IdentifierEditor"],
    "../components/editors/ReadonlyField": ["ReadonlyField"],
    "../components/editors/RawExpressionEditor": ["ContextAwareRawExpressionEditor"],
    "../components/editors/IdentifierField": ["IdentifierField"],
    "../components/editors/PathEditor": ["PathEditor"],
    "../components/editors/HeaderSetEditor": ["HeaderSetEditor"],
    "../components/editors/CustomDropdownEditor": ["CustomDropdownEditor"],
    "../components/editors/SliderEditor": ["SliderEditor"],
    "../components/editors/CheckBoxConditionalEditor": ["CheckBoxConditionalEditor"],
    "../components/editors/ActionTypeEditor": ["ActionTypeEditor"],
    "../components/editors/AutoCompleteEditor": ["AutoCompleteEditor"],
    "../components/editors/FormArrayEditorWrapper": ["FormArrayEditorWrapper"],
    "../components/editors/FormMapEditorNewWrapper": ["FormMapEditorWrapper"],
    "../components/ParamManager/ArgManager": ["ArgManagerEditor"],
    "../components/editors/DependentTypeEditor": ["DependentTypeEditor"],
    "../components/editors/FieldFactory": ["FieldFactory"],
    "../components/editors/GroupSectionEditor": ["GroupSectionEditor"],
    "../components/editors/ConnectionEditor/ConnectionEditor": ["ConnectionEditor"],
};

/**
 * Replace every child editor module with lightweight stubs that render
 * `<div data-testid="<ExportName>" />`, so a test can assert *which* editor
 * EditorFactory selected without loading heavy editors (Monaco, etc.).
 *
 * Must be called before EditorFactory is first required (renderField does that
 * lazily), i.e. at the top level of the test file.
 */
export function mockEditors(): void {
    for (const [modulePath, exportNames] of Object.entries(EDITOR_MODULES)) {
        jest.mock(
            modulePath,
            () => {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const react = require("react");
                const mod: Record<string, unknown> = { __esModule: true };
                for (const name of exportNames) {
                    mod[name] = (props: any) =>
                        react.createElement("div", { "data-testid": name, "data-field-key": props?.field?.key });
                }
                return mod;
            },
            { virtual: false }
        );
    }
}

const noop = () => {
    /* no-op */
};

/** Default (all no-op) props for EditorFactory; override as needed. */
export function defaultEditorProps(): Omit<FormFieldEditorProps, "field" | "fieldInputType"> {
    return {
        openRecordEditor: noop,
        openSubPanel: noop,
        handleOnFieldFocus: noop,
        onBlur: noop,
        handleOnTypeChange: noop,
        onIdentifierEditingStateChange: noop,
        setSubComponentEnabled: noop,
        handleNewTypeSelected: noop,
        openFormTypeEditor: noop,
        updateImports: noop,
    };
}

/**
 * Render EditorFactory for a given field + resolved input type.
 * EditorFactory is required lazily so mockEditors() (called earlier) takes effect.
 */
export function renderField(
    field: FormField,
    fieldInputType: any,
    overrides: Partial<FormFieldEditorProps> = {}
) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { EditorFactory } = require("../components/editors/EditorFactory");
    return render(
        <EditorFactory
            field={field}
            fieldInputType={fieldInputType}
            {...defaultEditorProps()}
            {...overrides}
        />
    );
}
