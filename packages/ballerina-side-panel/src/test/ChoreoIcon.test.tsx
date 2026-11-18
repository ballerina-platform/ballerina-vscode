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

import React from "react";
import { render } from "@testing-library/react";
import { CodeData } from "@wso2/ballerina-core";
import { getNodeReferenceIcon } from "../components/editors/NodeReferenceSelect";

describe("model provider dropdown icon", () => {
    const defaultProviders: CodeData[] = [
        { module: "ai", node: "MODEL_PROVIDER", object: "Wso2ModelProvider" },
        { module: "ai", node: "EMBEDDING_PROVIDER", object: "Wso2EmbeddingProvider" },
    ];

    it.each(defaultProviders)("shows the Choreo mark, not the old glyph, for the default $node", (codedata) => {
        const { container } = render(getNodeReferenceIcon(codedata));
        expect(container.querySelector('svg[aria-label="Choreo"]')).not.toBeNull();
        expect(container.querySelector(".fw-bi-wso2")).toBeNull();
    });
});
