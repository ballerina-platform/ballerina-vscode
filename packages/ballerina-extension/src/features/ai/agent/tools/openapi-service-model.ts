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

/**
 * Prepares the HTTP service init model for "Import From OpenAPI Specification". Kept apart from
 * connector-generator.ts, which imports the language client and cannot be loaded in a unit test.
 */

import type { ServiceInitModel, ValidationResult } from "@wso2/ballerina-core";

const DESIGN_APPROACH = "designApproach";
const SPEC = "spec";
const SERVICE_TYPE_NAME = "serviceTypeName";

/**
 * "Order Management API" -> "OrderManagementAPIService". The suffix avoids a clash with the spec's
 * record types, which the language server rejects.
 */
export function toServiceTypeName(title: string | undefined): string {
    const words = (title ?? "").replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
    let name = words.map(word => word[0].toUpperCase() + word.slice(1)).join("") || "Api";
    if (/^[0-9]/.test(name)) {
        name = `Api${name}`;
    }
    return name.endsWith("Service") ? name : `${name}Service`;
}

/** Returns a copy of the model with the OpenAPI design approach selected and pointed at the spec. */
export function selectOpenApiDesign(model: ServiceInitModel, specPath: string, typeName: string): ServiceInitModel {
    const result: ServiceInitModel = structuredClone(model);
    const designApproach = result.properties?.[DESIGN_APPROACH];
    const openApiChoice = designApproach?.choices?.find(choice => choice.properties?.[SPEC]);
    if (!designApproach || !openApiChoice) {
        throw new Error("The HTTP service model has no 'Import From OpenAPI Specification' option");
    }
    for (const choice of designApproach.choices) {
        choice.enabled = choice === openApiChoice;
    }
    openApiChoice.properties[SPEC].value = specPath;
    const serviceTypeName = openApiChoice.properties[SERVICE_TYPE_NAME];
    if (serviceTypeName) {
        serviceTypeName.value = typeName;
    }
    return result;
}

/** Whether the source declares the service implementing the given contract type. */
export function implementsServiceContract(source: string, typeName: string): boolean {
    const escaped = typeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\bservice\\s+${escaped}\\s+on\\b`).test(source);
}

/** Messages of the validation errors that block generation. */
export function blockingValidationMessages(results: ValidationResult[] | undefined): string[] {
    return (results ?? []).filter(result => result.severity === "ERROR").map(result => result.message);
}
