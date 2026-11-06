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

// The core barrel pulls in ESM-only LS transport modules that jest cannot load; the GraphQL name rule lives in a
// self-contained module, so it is loaded as is.
jest.mock("@wso2/ballerina-core", () => ({
    __esModule: true,
    ...jest.requireActual("@wso2/ballerina-core/lib/utils/source-name-utils"),
    getPrimaryInputType: (types: any[]) => (types && types.length > 0 ? types[0] : undefined),
}));
jest.mock("../../../views/BI/Forms/ArtifactForm", () => ({ __esModule: true, ArtifactForm: (): null => null }));
jest.mock("../../../utils/bi", () => ({ getImportsForProperty: (): undefined => undefined }));

import { ConfigProperties, GRAPHQL_NAME_RULE } from "@wso2/ballerina-core";
import { convertSchemaToFormFields, withGraphqlArgumentNameRule } from "../../../views/GraphQLDiagram/OperationForm";

const schema = {
    parameter: {
        name: { metadata: { label: "Name" }, types: [{ fieldType: "IDENTIFIER", selected: true }] },
        type: { metadata: { label: "Type" }, types: [{ fieldType: "TYPE", selected: true }] },
    },
} as unknown as ConfigProperties;

const rulesOf = (key: string, fields: ReturnType<typeof convertSchemaToFormFields>) =>
    (fields.find((field) => field.key === key)?.types ?? [])
        .flatMap((type: any) => type.validations ?? [])
        .map((validation: any) => validation.rule);

describe("withGraphqlArgumentNameRule", () => {
    it("adds the GraphQL name rule to the argument name only", () => {
        const fields = withGraphqlArgumentNameRule(convertSchemaToFormFields(schema));

        expect(rulesOf("variable", fields)).toEqual([GRAPHQL_NAME_RULE]);
        expect(rulesOf("type", fields)).toEqual([]);
    });

    it("leaves the schema fields of other forms unchanged", () => {
        expect(rulesOf("variable", convertSchemaToFormFields(schema))).toEqual([]);
    });
});
