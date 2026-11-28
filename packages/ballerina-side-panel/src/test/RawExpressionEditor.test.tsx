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

import React from "react";
import { render } from "@testing-library/react";
import type { FormField } from "../components/Form/types";

let formValue = "";
const editorProps: any[] = [];
jest.mock("../context", () => ({
    useFormContext: () => ({ form: { watch: () => formValue }, expressionEditor: {}, targetLineRange: undefined, fileName: "main.bal" }),
}));
jest.mock("../components/editors/ExpressionEditor", () => ({
    ExpressionEditor: (props: any) => {
        editorProps.push(props);
        return null;
    },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ContextAwareRawExpressionEditor } = require("../components/editors/RawExpressionEditor");

const DOCUMENT = "${<ai:TextDocument>{content: notes}}";
const queryField = (): FormField => ({
    key: "query",
    label: "Query",
    types: [
        { fieldType: "PROMPT", ballerinaType: "string", selected: true },
        { fieldType: "EXPRESSION", ballerinaType: "anydata|ai:Prompt", selected: false },
    ],
} as unknown as FormField);

describe("ContextAwareRawExpressionEditor", () => {
    beforeEach(() => {
        editorProps.length = 0;
    });

    it("checks and writes a string prompt that holds a document as an ai:Prompt, leaving the form's field as it was", () => {
        formValue = `string \`Read ${DOCUMENT}\``;
        const field = queryField();
        render(<ContextAwareRawExpressionEditor field={field} />);
        const props = editorProps.at(-1);

        expect(field.types[0].ballerinaType).toBe("string");
        expect(props.field.types[0].ballerinaType).toBe("ai:Prompt");
        expect(props.rawExpression(`Read ${DOCUMENT}`)).toBe(`\`Read ${DOCUMENT}\``);
        expect(props.sanitizedExpression(`\`Read ${DOCUMENT}\``)).toBe(`Read ${DOCUMENT}`);
    });

    it("keeps a string prompt without a document as a string template", () => {
        formValue = "string `Hi`";
        const field = queryField();
        render(<ContextAwareRawExpressionEditor field={field} />);
        const props = editorProps.at(-1);

        expect(props.field).toBe(field);
        expect(props.rawExpression("Hi")).toBe("string `Hi`");
        expect(props.sanitizedExpression("string `Hi`")).toBe("Hi");
    });

    it("writes a string template again once the document is removed, and shows its text", () => {
        formValue = `\`Read ${DOCUMENT}\``;
        render(<ContextAwareRawExpressionEditor field={queryField()} />);
        expect(editorProps.at(-1).rawExpression("Read ")).toBe("string `Read `");

        formValue = "`Read `";
        render(<ContextAwareRawExpressionEditor field={queryField()} />);
        const props = editorProps.at(-1);
        expect(props.sanitizedExpression("`Read `")).toBe("Read ");
        expect(props.rawExpression("Read again")).toBe("string `Read again`");
    });

    it("leaves an expression that is not one template as it is", () => {
        formValue = "`a` + `b`";
        render(<ContextAwareRawExpressionEditor field={queryField()} />);
        expect(editorProps.at(-1).sanitizedExpression("`a` + `b`")).toBe("`a` + `b`");
    });
});
