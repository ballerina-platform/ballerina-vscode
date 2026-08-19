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

// Pure helpers for deciding how the helper pane joins a field-access path segment
// (`.` vs `?.`).

// Ballerina renders optionality either as a trailing `?` (e.g. `string?`,
// `ChangeEventMetadata?`, `(A|B)?`) or as a union with nil written out
// (e.g. `string|()`, `Foo | ( )`). Detect both forms.
const NIL_UNION_RE = /\|\s*\(\s*\)$/;

export const isOptionalType = (t?: string): boolean => {
    if (!t) return false;
    const s = t.trim();
    return s.endsWith('?') || NIL_UNION_RE.test(s);
};

export const accessSeparator = (parentNilable?: boolean, selectedItemValue?: string): string =>
    parentNilable || selectedItemValue?.startsWith('?.') ? '?.' : '.';

export const isNilableAfterAccess = (usedOptionalAccess: boolean, stepType?: string): boolean =>
    usedOptionalAccess || isOptionalType(stepType);
