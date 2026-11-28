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

import { TEMPLATE_CONFIGS, templateOf, templateText, wrapTemplate } from "./RawExpressionEditor";
import { promptEditorConfig } from "./ExpressionField";
import { FormField } from "../Form/types";

const PROMPT = TEMPLATE_CONFIGS["ai:Prompt"];
const STRING = TEMPLATE_CONFIGS["string"];

describe("raw template round trip", () => {
    it("shows the text inside a string template on an ai:Prompt field and saves it back as one", () => {
        const value = "string `Subject: ${ticket.subject}\n\n${ticket.body}`";
        const template = templateOf(value, PROMPT);
        expect(template).toBe(STRING);
        const text = templateText(value, template);
        expect(text).toBe("Subject: ${ticket.subject}\n\n${ticket.body}");
        expect(wrapTemplate(text, template)).toBe(value);
    });

    it("keeps a raw template as a raw template", () => {
        const value = "`Hello ${name}`";
        const template = templateOf(value, PROMPT);
        expect(templateText(value, template)).toBe("Hello ${name}");
        expect(wrapTemplate("Hi ${name}", template)).toBe("`Hi ${name}`");
    });

    it("leaves a value that is not a template as it is", () => {
        expect(templateOf("greeting", PROMPT)).toBeUndefined();
        expect(templateText("greeting", undefined)).toBe("greeting");
    });
});

describe("prompt field editor", () => {
    const field = { types: [{ fieldType: "PROMPT", ballerinaType: "ai:Prompt", selected: true }] } as unknown as FormField;

    it("edits a string template's text and saves it as a string template", () => {
        const config = promptEditorConfig(field, "string `Subject: ${ticket.subject}`");
        expect(config.serializeValue("string `Subject: ${ticket.subject}`")).toBe("Subject: ${ticket.subject}");
        expect(config.deserializeValue("Subject: ${ticket.subject}")).toBe("string `Subject: ${ticket.subject}`");
    });

    it("edits a raw template as a raw template", () => {
        const config = promptEditorConfig(field, "`Hello ${name}`");
        expect(config.serializeValue("`Hello ${name}`")).toBe("Hello ${name}");
        expect(config.deserializeValue("Hi ${name}")).toBe("`Hi ${name}`");
    });
});
