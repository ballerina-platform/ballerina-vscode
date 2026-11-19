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
 * The GraphQL "ID Type" flag a reopened parameter's field should start with: the saved flag for
 * the type field (the `ACTION_TYPE` editor that renders the checkbox), `undefined` otherwise.
 */
export function getGraphqlIdForField(field: FormField, formValues: FormValues): boolean | undefined {
    if (getPrimaryInputType(field.types)?.fieldType !== "ACTION_TYPE") {
        return undefined;
    }
    const flag = formValues["isGraphqlId"];
    return typeof flag === "boolean" ? flag : undefined;
}
