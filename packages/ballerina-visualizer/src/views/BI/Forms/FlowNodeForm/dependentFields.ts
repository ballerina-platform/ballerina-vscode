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
 * A field typed from another field's value — the child workflow's input from the workflow
 * dropdown, say — carries that field's key as `codedata.dependentProperty`. When the dropdown
 * changes, the template for the new choice is fetched and the dependent fields take their type,
 * placeholder and documentation from it, keeping whatever the person had typed.
 */
export function dependentFieldKeys(fields: FormField[], changedKey: string): string[] {
    return fields.filter((field) => dependsOn(field.codedata, changedKey)).map((field) => field.key);
}

/**
 * The same, read from a freshly fetched template. A statement re-read from source does not always
 * carry the tags — the variable's type property is attached after the analysis that would set them
 * — while the template a choice is fetched with always does, so it is the one asked.
 */
export function dependentKeysFromTemplate(template: NodeProperties, changedKey: string): string[] {
    return Object.entries((template ?? {}) as Record<string, any>)
        .filter(([, property]) => dependsOn(property?.codedata, changedKey))
        .map(([key]) => key);
}

function dependsOn(codedata: { dependentProperty?: string | string[] } | undefined, changedKey: string): boolean {
    const declared = codedata?.dependentProperty;
    return Array.isArray(declared) ? declared.includes(changedKey) : declared === changedKey;
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
            types: JSON.parse(JSON.stringify(property.types ?? field.types)),
            placeholder: property.placeholder ?? field.placeholder,
            documentation: property.metadata?.description ?? field.documentation,
            // A value the template carries is the new choice's own default — the result type of
            // the chosen workflow, say — and replaces the old one; an empty template value keeps
            // what the person typed.
            value: property.value !== undefined && property.value !== "" ? property.value : field.value,
        };
    });
}
