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

import { FunctionModel, InputType, LineRange } from "@wso2/ballerina-core";

// Resource methods clash only with the same accessor; remote and other methods share one namespace.
// GraphQL kinds map onto those: a query is a `get` resource, a subscription a `subscribe` resource and
// a mutation a remote method.
function getNamespace(operation: FunctionModel): string {
    switch (operation.kind) {
        case "QUERY":
            return "get";
        case "SUBSCRIPTION":
            return "subscribe";
        case "RESOURCE":
            return operation.accessor?.value || "get";
        default:
            return "method";
    }
}

function isSameRange(a?: LineRange, b?: LineRange): boolean {
    return !!a && !!b && a.startLine.line === b.startLine.line && a.startLine.offset === b.startLine.offset;
}

const normalizeName = (name: string) => name.trim().replace(/^'/, "");

/**
 * Names the operation cannot take because a sibling of the same kind already uses them
 * (wso2/product-integrator#382). The operation being edited is skipped, whether the form holds it or a copy.
 */
export function getTakenOperationNames(operation: FunctionModel, operations: FunctionModel[] = []): string[] {
    const namespace = getNamespace(operation);
    return operations
        .filter((other) => other !== operation && !isSameRange(other.codedata?.lineRange, operation.codedata?.lineRange))
        .filter((other) => getNamespace(other) === namespace && other.name?.value)
        .map((other) => normalizeName(other.name.value));
}

/** Adds the rule rejecting `takenNames` to the name field's active type member, which is where rules are read. */
export function withTakenNamesRule(types: InputType[] | undefined, takenNames: string[], message: string): InputType[] | undefined {
    if (!types?.length || !takenNames.length) {
        return types;
    }
    const activeIndex = Math.max(types.findIndex((type) => type.selected), 0);
    return types.map((type, index) => index !== activeIndex ? type : {
        ...type,
        validations: [...(type.validations ?? []), { rule: "vscode.validate.not.in", args: { values: takenNames }, message }],
    });
}
