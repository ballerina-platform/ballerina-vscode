/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { DropdownType, InputType, TemplateType } from "../interfaces/bi";

export const getPrimaryInputType = (types: InputType[]): InputType | undefined => {
  if (!types || types.length === 0) return undefined;
  return types[0];
}

// The type shown as a field's type hint. The primary input type is often a narrowed input mode — e.g.
// a `string|string[]` field is split into a `TEXT string` mode first, and an optional `time:Duration?`
// into a `RECORD_MAP time:Duration` mode first — while the field's full declared type lives on the
// EXPRESSION entry. Prefer that so unions/optionals (and dynamic activity params) display their full type.
export const getFieldTypeLabel = (types?: InputType[]): string | undefined => {
  if (!types || types.length === 0) return undefined;
  const expressionType = types.find((t) => t.fieldType === "EXPRESSION" && !!t.ballerinaType);
  return expressionType?.ballerinaType ?? getPrimaryInputType(types)?.ballerinaType;
}

export const getSecondaryInputType = (inputTypes: InputType[]) => {
    return inputTypes?.length ? inputTypes[inputTypes.length - 1] : undefined;
}

export const isTemplateType = (
  value: InputType
): value is TemplateType => {
  return value !== null && typeof value === "object" && "template" in value;
};

export const isDropDownType = (
  value: InputType
): value is DropdownType => {
  return (
    value !== null && 
    "options" in value &&
    (value?.fieldType === "SINGLE_SELECT" || value?.fieldType === "MULTIPLE_SELECT")
  );
};
