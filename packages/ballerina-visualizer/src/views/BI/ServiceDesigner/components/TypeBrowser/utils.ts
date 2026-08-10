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

// Type-browser search matching, extracted from TypeBrowser.tsx to be unit-testable.
// The normalization here is the #602/#619 class: a type query must match regardless
// of case, surrounding whitespace, a trailing optional-marker `?`, or an array `[]`
// suffix — otherwise valid types "disappear" from the picker as the user types.
export function filterTypeBrowserItems(items: string[], query: string): string[] {
    if (query === "") {
        return items;
    }
    const normalizedQuery = query
        .toLowerCase()
        .replace(/\?/g, "")
        .replace(/\s+/g, "")
        .replace(/\[\]/g, "");
    return items.filter((item) => item.toLowerCase().replace(/\s+/g, "").includes(normalizedQuery));
}
