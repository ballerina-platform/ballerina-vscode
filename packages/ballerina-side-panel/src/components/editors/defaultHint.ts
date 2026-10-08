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

import { isDropDownType } from "@wso2/ballerina-core";
import type { FormField } from "../Form/types";

// Defaults that state no value worth presenting: nil, and the empty object a client defaults to.
const UNSTATED_DEFAULTS = ["()", "object {}"];

/**
 * The text of the "(Default: …)" hint of a field, or none when there is no default to state.
 *
 * A field offering a dropdown names its default by the entry the dropdown presents as selected, which is the option
 * whose value the placeholder holds. That entry is labelled by the name of an enum member and by the value of a
 * constant, whereas the declared default arrives as either, depending on whether the source of the module was
 * resolved: `http:HTTP_2_0` or `"2.0"` for the same member. Any other field states the declared default as it is.
 */
export function getDefaultHint(field: FormField): string | undefined {
    const dropdown = field.types?.find(isDropDownType);
    const option = dropdown && field.placeholder
        ? dropdown.options?.find(item => item.value === field.placeholder)
        : undefined;
    if (option) {
        return option.label;
    }
    const defaultValue = field.defaultValue?.trim();
    if (!defaultValue || UNSTATED_DEFAULTS.includes(defaultValue)) {
        return undefined;
    }
    return field.defaultValue;
}
