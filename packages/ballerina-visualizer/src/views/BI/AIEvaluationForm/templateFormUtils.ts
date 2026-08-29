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

import type { FormField } from "@wso2/ballerina-side-panel";

export type DataSourceMode = 'evalset' | 'queries';

export type DataSourceParam = { paramName: string; kind: 'union' | 'strict' };

export const partitionTemplateFields = (templateFields: FormField[], agentFieldKey?: string): {
    agentField?: FormField;
    requiredFields: FormField[];
    optionalFields: FormField[];
} => {
    const agentField = templateFields.find(field => field.key === agentFieldKey);
    const remainingFields = templateFields.filter(field => field.key !== agentFieldKey);
    return {
        agentField,
        requiredFields: remainingFields.filter(field => !field.optional),
        optionalFields: remainingFields.filter(field => field.optional),
    };
};

export const isDataSourceSatisfied = (args: {
    dataSourceParam?: DataSourceParam;
    dataSourceMode: DataSourceMode;
    evalSetFile: string;
    queries: readonly string[];
}): boolean => {
    if (!args.dataSourceParam) {
        return true;
    }
    return args.dataSourceMode === 'evalset'
        ? !!args.evalSetFile
        : args.queries.some(query => query?.trim());
};
