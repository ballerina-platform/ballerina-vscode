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

import type { InputType } from "@wso2/ballerina-core";
import { chipRemovalStart, createChipSchema } from "../components/editors/MultiModeExpressionEditor/RichTextTemplateEditor/plugins/chipPlugin";
import { takesPrompt } from "../components/editors/RawExpressionEditor";

describe("chipRemovalStart", () => {
    const schema = createChipSchema();
    // "Hi " + chip + after; the chip sits at 4..5 inside the paragraph.
    const docWith = (after: string) => schema.node("doc", null, [
        schema.node("paragraph", null, [schema.text("Hi "), schema.node("chip", { text: "${name}" }), ...(after ? [schema.text(after)] : [])]),
    ]);

    it("takes the space before a chip at the end of the text", () => {
        expect(chipRemovalStart(docWith(""), 4, 5)).toBe(3);
    });

    it("takes the space before a chip followed by punctuation", () => {
        expect(chipRemovalStart(docWith(", welcome"), 4, 5)).toBe(3);
    });

    it("keeps the space before a chip followed by a word", () => {
        expect(chipRemovalStart(docWith("welcome"), 4, 5)).toBe(4);
    });
});

describe("takesPrompt", () => {
    it("is true when a type's union includes ai:Prompt", () => {
        expect(takesPrompt([{ fieldType: "PROMPT", ballerinaType: "string|ai:Prompt" } as InputType])).toBe(true);
    });

    it("is false for a plain string prompt", () => {
        expect(takesPrompt([{ fieldType: "PROMPT", ballerinaType: "string" } as InputType])).toBe(false);
    });
});
