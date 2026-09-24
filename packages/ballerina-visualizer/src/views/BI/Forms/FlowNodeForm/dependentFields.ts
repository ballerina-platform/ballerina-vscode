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
import { FormField } from "@wso2/ballerina-side-panel";
import { NodeProperties } from "@wso2/ballerina-core";

/**
 * The node kinds whose form picks a workflow and types other fields from it. Asking for a template
 * is gated on these: a SINGLE_SELECT is common — a model provider, a type — and a template fetched
 * for `symbol: "gpt-4o"` asks the language server for a symbol that does not exist.
 */
const WORKFLOW_PICKING_NODES = ["WORKFLOW_RUN", "CHILD_WORKFLOW_RUN", "CHILD_WORKFLOW_CALL"];

/** Whether this node's form is one that retypes its fields from a chosen workflow. */
export function picksWorkflow(nodeKind: string | undefined): boolean {
    return !!nodeKind && WORKFLOW_PICKING_NODES.includes(nodeKind);
}

/** What a form's fields held when it opened, by key. */
export type LastSeenValues = Record<string, unknown>;

/**
 * Whether a reported change is worth fetching a template for, and records it when it is.
 *
 * `Form` reports every field as changed on its first render, so without this a form would retype
 * itself from its own opening value — replacing a result type the source declares and coming up
 * dirty. Kept per key rather than against the opening value alone, so choosing A, then B, then A
 * again still retypes back to A.
 *
 * @param lastSeen the values each field was last seen holding, updated in place
 * @param key      the field that changed
 * @param value    its new value, narrowed so the caller can pass it on as the symbol
 */
export function shouldRetype(lastSeen: LastSeenValues, key: string, value: unknown): value is string {
    if (typeof value !== "string" || value === "" || value === lastSeen[key]) {
        return false;
    }
    lastSeen[key] = value;
    return true;
}

/**
 * Puts back what `shouldRetype` recorded, so a template request that failed or was superseded does
 * not leave the field looking already retyped and refuse to try that value again.
 *
 * @param previous what the key held before the request, restored only while the key still holds
 *                 `value` — a newer attempt that has recorded its own owns the key
 */
export function forgetRetype(lastSeen: LastSeenValues, key: string, value: string, previous: unknown): void {
    if (lastSeen[key] !== value) {
        return;
    }
    if (previous === undefined) {
        delete lastSeen[key];
    } else {
        lastSeen[key] = previous;
    }
}

/**
 * The fields a template says follow another field's value — the child workflow's input follows the
 * workflow dropdown, say. The template is what is asked rather than the node being edited: a
 * statement re-read from source does not carry the tags, because its variable-type property is
 * attached after the analysis that would set them.
 */
export function dependentKeysFromTemplate(template: NodeProperties, changedKey: string): string[] {
    return Object.entries((template ?? {}) as Record<string, any>)
        .filter(([, property]) => dependsOn(property?.codedata, changedKey))
        .map(([key]) => key);
}

function dependsOn(codedata: { dependentProperty?: string } | undefined, changedKey: string): boolean {
    return codedata?.dependentProperty === changedKey;
}

/**
 * Retypes the named fields from the properties of a template fetched for the new choice. A field
 * the template no longer offers — an input, when the chosen workflow takes none — is hidden with
 * its value cleared, so nothing is emitted for it.
 */
export function retypeFieldsFromTemplate(fields: FormField[], keys: string[], template: NodeProperties): FormField[] {
    return fields.map((field) => {
        if (!keys.includes(field.key)) {
            return field;
        }
        const property = (template as Record<string, any>)?.[field.key];
        if (!property) {
            return { ...field, hidden: true, value: "" };
        }
        return {
            ...field,
            hidden: false,
            // A fresh copy, so editing the retyped field cannot reach back into the template. Both
            // sides may be absent: `Property.types` is optional on the wire.
            types: structuredClone(property.types ?? field.types ?? []),
            placeholder: property.placeholder ?? field.placeholder,
            documentation: property.metadata?.description ?? field.documentation,
            // A value the template carries is the new choice's own default — the result type of
            // the chosen workflow, say — and replaces the old one; an empty template value keeps
            // what the person typed.
            value: property.value !== undefined && property.value !== "" ? property.value : field.value,
        };
    });
}
