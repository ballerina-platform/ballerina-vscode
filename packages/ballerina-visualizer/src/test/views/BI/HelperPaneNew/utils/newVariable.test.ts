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

// L1: the helper pane's "+ New Variable" form is the language server's Declare Variable template at
// the field, which names the variable after nothing visible there (issue-1770: `var1` was suggested
// while `var1` existed). It takes the field's type and asks for a value, since the field reads the
// variable as soon as it is created. The templates are the language server's own expected output
// (node_template/config/variable.json). When the language server gives none, the form opens on a local
// copy of it that names nothing, held to the same rules. The language server cannot see the variable
// the form it is opened from declares itself, so a template named after it is left unnamed.

import type { FlowNode } from "@wso2/ballerina-core";
import { localVariableTemplate, newVariableNode } from "../../../../../views/BI/HelperPaneNew/utils/newVariable";
import fixture from "./fixtures/issue-1770.json";

const captured = fixture.templates as unknown as FlowNode[];

const templates: [string, FlowNode][] = [
    ...captured.map((template): [string, FlowNode] => [`the language server's, naming ${template.properties.variable.value}`, template]),
    ["the local one, naming nothing", localVariableTemplate()],
];

const cases = templates.flatMap(([name, template]) =>
    fixture.fieldTypes.map((type) => [name, type ?? "(none)", template, type ?? undefined] as const));

describe.each(cases)("template %s, field type %s", (_name, _label, template, type) => {
    it("keeps the template's name and node", () => {
        const node = newVariableNode(template, type);
        expect(node.codedata).toEqual(template.codedata);
        expect(node.metadata).toEqual(template.metadata);
        expect(node.properties.variable).toEqual(template.properties.variable);
    });

    it("takes the field's type, if it has one", () => {
        expect(newVariableNode(template, type).properties.type.value).toBe(type ?? template.properties.type.value);
    });

    it("requires a value", () => {
        expect(newVariableNode(template, type).properties.expression.optional).toBe(false);
    });

    it("leaves the template as it was", () => {
        const before = JSON.parse(JSON.stringify(template));
        newVariableNode(template, type, [template.properties.variable.value as string]);
        expect(template).toEqual(before);
    });

    it.each((fixture.ownNames as string[][]).map((ownNames) => [ownNames]))(
        "opened from a form declaring %j, is named only after a name that form leaves free", (ownNames) => {
            const name = template.properties.variable.value as string;
            const variable = newVariableNode(template, type, ownNames).properties.variable;
            expect(variable.value).toBe(ownNames.includes(name) ? "" : name);
            expect({ ...variable, value: name }).toEqual(template.properties.variable);
        });
});

describe("the local template", () => {
    it.each(captured.map((template) => [template.properties.variable.value, template] as const))(
        "is the language server's template naming %s, naming nothing instead", (_name, template) => {
            // The language server leaves out `branches`, which every FlowNode has.
            expect(localVariableTemplate()).toEqual({
                ...template,
                branches: [],
                properties: { ...template.properties, variable: { ...template.properties.variable, value: "" } },
            });
        });

    it("is a new node each time", () => {
        const first = localVariableTemplate();
        first.properties.variable.value = "taken";
        first.properties.type.value = "int";
        expect(localVariableTemplate().properties.variable.value).toBe("");
        expect(localVariableTemplate().properties.type.value).toBe("");
    });
});
