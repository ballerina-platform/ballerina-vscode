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

import { getPrimaryInputType } from "@wso2/ballerina-core";
import { FormField, FormValues } from "../Form/types";

/**
 * The identifier values the editor holds that were renamed in place through the LS. Such a
 * field (a read-only identifier with a source range, rendered by IdentifierEditor) changes only
 * when a rename is applied to the source, so its new value stands even if the edit is cancelled.
 * Returns the changed values keyed by field, empty when nothing was renamed.
 */
export function getAppliedRenames(fields: FormField[], values: FormValues, saved: FormValues): FormValues {
    const renames: FormValues = {};
    for (const field of fields) {
        const isRenamedInPlace = getPrimaryInputType(field.types)?.fieldType === "IDENTIFIER"
            && !field.editable && !!field.lineRange;
        const value = values?.[field.key];
        if (isRenamedInPlace && typeof value === "string" && value && value !== saved?.[field.key]) {
            renames[field.key] = value;
        }
    }
    return renames;
}
