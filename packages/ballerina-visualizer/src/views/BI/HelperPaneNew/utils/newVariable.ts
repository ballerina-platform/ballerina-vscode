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

import { FlowNode } from "@wso2/ballerina-core";

/**
 * How long "+ New Variable" waits for the language server's template before opening its form on the
 * local one. The wait has to end: the extension leaves a request the language server fails unanswered.
 */
export const TEMPLATE_TIMEOUT_MS = 3000;

/**
 * The node behind the helper pane's "+ New Variable" form, from the language server's Declare Variable
 * template at the field: the template names the variable after nothing visible there. It takes the
 * field's type, when there is one, and its value is required: the field being edited reads the
 * variable straight away, and reading a variable that was never assigned does not compile.
 *
 * `ownNames` are the variables the form it is opened from declares itself. The language server cannot
 * see those at the field (one is unsaved, or declared by the very statement being edited), so its
 * template may be named after one. Such a template is left unnamed, for the user to name: the next
 * name along could be taken too.
 */
export function newVariableNode(template: FlowNode, type?: string, ownNames: string[] = []): FlowNode {
    const properties = { ...template.properties };
    if (properties.variable && ownNames.includes(properties.variable.value as string)) {
        properties.variable = { ...properties.variable, value: "" };
    }
    if (properties.type && type) {
        properties.type = { ...properties.type, value: type };
    }
    if (properties.expression) {
        properties.expression = { ...properties.expression, optional: false };
    }
    return { ...template, properties };
}

/**
 * The language server's Declare Variable template, for when asking it for one fails or gets none, so
 * that "+ New Variable" still opens its form. It names the variable after nothing: the pane cannot tell
 * which names are taken (inside a record it lists the record's fields, and before its completions
 * arrive it lists nothing), so the user names it. A new node each time, so that no form can change
 * the next one's.
 */
export function localVariableTemplate(): FlowNode {
    return {
        id: "31",
        metadata: { label: "Declare Variable", description: "Create a new variable" },
        codedata: { node: "VARIABLE", isNew: true },
        returning: false,
        properties: {
            variable: {
                metadata: { label: "Name", description: "Name of the variable" },
                types: [{ fieldType: "IDENTIFIER", selected: true }],
                value: "",
                optional: false,
                editable: true,
                advanced: false,
                hidden: false,
            },
            type: {
                metadata: { label: "Type", description: "Type of the variable" },
                types: [{ fieldType: "TYPE", selected: true }],
                value: "",
                placeholder: "var",
                optional: false,
                editable: true,
                advanced: false,
                hidden: false,
                codedata: {},
            },
            expression: {
                metadata: { label: "Expression", description: "Initialize with value" },
                types: [{ fieldType: "ACTION_OR_EXPRESSION", selected: true }],
                value: "",
                optional: true,
                editable: true,
                advanced: false,
                hidden: false,
            },
        },
        branches: [],
        flags: 0,
    };
}
