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

import { getNodeTitle } from "../utils/node";

describe("AI component call titles", () => {
    it("titles a knowledge base call by the component kind, not the provider package", () => {
        const node = {
            codedata: { node: "KNOWLEDGE_BASE_CALL", org: "ballerinax", module: "ai.azure" },
            metadata: { label: "retrieve" },
            properties: {},
        } as any;
        expect(getNodeTitle(node)).toBe("Knowledge Base : retrieve");
    });

    it("titles a data loader method call by the component kind", () => {
        const node = {
            codedata: { node: "METHOD_CALL", org: "ballerina", module: "ai" },
            metadata: { label: "load", data: { connectorType: "dataLoader" } },
            properties: {},
        } as any;
        expect(getNodeTitle(node)).toBe("Data Loader : load");
    });

    it("keeps the module prefix for other method calls", () => {
        const node = {
            codedata: { node: "METHOD_CALL", org: "ballerina", module: "ai" },
            metadata: { label: "chunk" },
            properties: {},
        } as any;
        expect(getNodeTitle(node)).toBe("ai : chunk");
    });
});
