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
import { FormField, FormValues } from "@wso2/ballerina-side-panel";
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
 * Whether a reported change is worth fetching a template for, recording it in `lastSeen` when it is.
 * Kept per key, so choosing A, then B, then A again still retypes back to A.
 */
export function shouldRetype(lastSeen: LastSeenValues, key: string, value: unknown): value is string {
    if (typeof value !== "string" || value === "" || value === lastSeen[key]) {
        return false;
    }
    lastSeen[key] = value;
    return true;
}

/**
 * Undoes `shouldRetype`'s record after a request fails or is superseded, so the same choice can be
 * tried again. A key that a newer choice has since recorded is left alone.
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
 * The fields that follow `changedKey`, asked of both sides: a node re-read from source lacks some tags,
 * and a template that drops a field altogether (a workflow with no input) cannot name it.
 */
export function dependentKeys(fields: FormField[], template: NodeProperties, changedKey: string): string[] {
    const keys = new Set(Object.entries((template ?? {}) as Record<string, any>)
        .filter(([, property]) => dependsOn(property?.codedata, changedKey))
        .map(([key]) => key));
    for (const field of fields) {
        if (dependsOn(field.codedata, changedKey)) {
            keys.add(field.key);
        }
    }
    return [...keys];
}

function dependsOn(codedata: { dependentProperty?: string } | undefined, changedKey: string): boolean {
    return codedata?.dependentProperty === changedKey;
}

/** Retypes the named fields from the new choice's template, hiding any the template no longer offers. */
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
            // A fresh copy, so editing the field cannot reach back into the template.
            types: structuredClone(property.types ?? field.types ?? []),
            placeholder: property.placeholder ?? field.placeholder,
            documentation: property.metadata?.description ?? field.documentation,
            // The new choice's own default (its result type, say) wins; an empty one keeps what was typed.
            value: property.value !== undefined && property.value !== "" ? property.value : field.value,
        };
    });
}

/**
 * Blanks the values of dependent fields the retype hid: `Form` keeps what a hidden field held, and the
 * source builders write any property that is not blank.
 */
export function clearHiddenDependentValues(values: FormValues, fields: FormField[]): FormValues {
    const hidden = fields.filter((field) => field.hidden && field.codedata?.dependentProperty);
    if (hidden.length === 0) {
        return values;
    }
    const cleared = { ...values };
    for (const field of hidden) {
        cleared[field.key] = "";
    }
    return cleared;
}
