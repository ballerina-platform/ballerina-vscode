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

import type { TypeField } from "@wso2/ballerina-core";

/**
 * Whether a union holds an expression of its own, with no member picked. RecordValueGenerator's generateUnionValue
 * writes a union's own value before any member's, so the tree and the form both treat such a union as that
 * expression: they pick no member for it and show no member's fields, whose edits it would ignore.
 */
export function holdsOwnExpression(union: TypeField): boolean {
    return typeof union.value === "string" && union.value.trim() !== ""
        && !(union.members ?? []).some((member) => member.selected);
}
