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

// Which fields of a connection form offer to make their value configurable, and what the form tells the language
// server about them. These are the fields whose value is the argument itself (a string, number or boolean typed in
// the form, such as a Kafka consumer's bootstrap servers), as opposed to the fields of a record argument, which the
// record editor handles.

import type { ConnectionConfigurableChoice, ConnectionConfigurablePreview, FlowNode, LineRange } from "@wso2/ballerina-core";
import { FormField, InputMode } from "@wso2/ballerina-side-panel";
import {
    choiceToSend,
    FieldConfigurable,
    isConfigurableValue,
    isValidConfigurableName,
    parameterKey
} from "../../HelperPaneNew/Components/RecordFormView/configurables";

/** The path the language server gives an argument that is itself the value, rather than a field within it. */
export const OWN_VALUE_PATH = "";

/** The init parameter kinds whose argument a configurable can stand for (ParameterData.Kind on the server). */
const ARGUMENT_KINDS = new Set(["REQUIRED", "DEFAULTABLE", "INCLUDED_FIELD"]);

/** The editor modes in which the user types a value; in the expression mode they write code, which stays as is. */
const TYPED_MODES = new Set<InputMode>([InputMode.TEXT, InputMode.NUMBER, InputMode.BOOLEAN]);

export function isArgumentKind(kind: string | undefined): boolean {
    return !!kind && ARGUMENT_KINDS.has(kind);
}

export function isTypedMode(mode: InputMode | undefined): boolean {
    return TYPED_MODES.has(mode as InputMode);
}

/** Whether a field holds a value worth naming: not empty, nor an empty string as the text box writes one. */
export function hasValue(value: unknown): boolean {
    if (value === undefined || value === null) {
        return false;
    }
    const text = String(value).trim();
    return text !== "" && text !== "\"\"" && text !== "string ``";
}

/**
 * What to tell the language server about a field (see choiceToSend). A value typed in is made configurable by default
 * when required; one written as an expression or chosen from a list stays in source.
 *
 * @param required whether the field must have a value
 * @param mode     the mode its editor is in, or undefined if the form hasn't shown it
 * @param choice   what the user chose for it
 */
export function fieldChoiceToSend(
    required: boolean,
    mode: InputMode | undefined,
    choice: FieldConfigurable | undefined
): ConnectionConfigurableChoice | undefined {
    // A field the form hasn't shown is one the user hasn't seen: only a required one, which they always see, may be
    // made configurable without being shown.
    const typed = mode === undefined ? required : isTypedMode(mode);
    return choiceToSend(typed && isConfigurableValue(required, choice), choice);
}

/** Whether a field's value could be a configurable the connection already uses: a plain name, maybe quoted. */
export function mayUseConfigurable(value: unknown): boolean {
    const text = typeof value === "string" ? value.trim().replace(/^'/, "") : "";
    return isValidConfigurableName(text) && text !== "true" && text !== "false";
}

/**
 * Opening an existing connection: each field that uses a configurable shows the configurable's value, read from
 * Config.toml, in the editor the user types values in, with "Make configurable" checked under the configurable's
 * name. Returns the fields as they open and the choices made for them.
 */
export function adoptExistingConfigurables(
    fields: FormField[],
    previews: ConnectionConfigurablePreview[] | undefined
): { fields: FormField[]; choices: Record<string, FieldConfigurable> } {
    const choices: Record<string, FieldConfigurable> = {};
    const adopted = new Map<string, ConnectionConfigurablePreview>();
    (previews ?? [])
        .filter((preview) => preview.fieldPath === OWN_VALUE_PATH && preview.existing && preview.value !== undefined)
        .forEach((preview) => adopted.set(parameterKey(preview), preview));
    const opened = fields.map((field) => {
        const preview = adopted.get(field.key);
        if (!preview || typeof field.value !== "string" || field.value.trim() !== preview.name) {
            return field;
        }
        choices[field.key] = { name: preview.name, existing: true, declaration: preview.declaration };
        // The first mode is the one a value is typed in; the configurable's name had opened the expression one.
        const types = field.types?.map((type, index) => ({ ...type, selected: index === 0 }));
        return { ...field, value: preview.value, types };
    });
    return { fields: opened, choices };
}

/**
 * Where an existing connection is now, among the module's connections as the language server reads them after a
 * rename across the project: a rename can make the connection's source longer or shorter. Renaming a configurable
 * changes neither the connection's name nor its file, and a module has one connection of a name, so it is found by
 * those. Undefined for a new connection, or one no longer there.
 */
export function connectionRangeAfterRename(connections: FlowNode[] | undefined, connection: FlowNode): LineRange | undefined {
    const range = connection?.codedata?.lineRange;
    const name = connection?.properties?.variable?.value;
    if (!range || typeof name !== "string") {
        return undefined;
    }
    return (connections ?? []).find((candidate) =>
        candidate?.properties?.variable?.value === name
        && candidate.codedata?.lineRange?.fileName === range.fileName
    )?.codedata?.lineRange;
}

/** Whether two ranges name the same source, whether or not they are the same object. */
export function isSameLineRange(a: LineRange | undefined, b: LineRange | undefined): boolean {
    return a?.fileName === b?.fileName
        && a?.startLine?.line === b?.startLine?.line && a?.startLine?.offset === b?.startLine?.offset
        && a?.endLine?.line === b?.endLine?.line && a?.endLine?.offset === b?.endLine?.offset;
}
