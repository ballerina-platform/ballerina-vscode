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
import { CodeData, GET_DEFAULT_EMBEDDING_PROVIDER, GET_DEFAULT_MODEL_PROVIDER } from "@wso2/ballerina-core";
import { AIModelIcon } from "../components/AIModelIcon";
import { ConnectorIcon } from "../components/ConnectorIcon";

// Every way the diagram recognises the default (Choreo) model or embedding provider.
const defaultProviders: CodeData[] = [
    { module: "ai", object: "Wso2ModelProvider" },
    { module: "ai", object: "Wso2EmbeddingProvider" },
    { module: "ai", symbol: GET_DEFAULT_MODEL_PROVIDER },
    { module: "ai", symbol: GET_DEFAULT_EMBEDDING_PROVIDER },
];

function expectChoreoMark(container: HTMLElement) {
    expect(container.querySelector('svg[aria-label="Choreo"]')).not.toBeNull();
    expect(container.querySelector(".fw-bi-wso2")).toBeNull();
}

describe("default model provider icon", () => {
    it.each(defaultProviders)("AIModelIcon shows the Choreo mark for %o", (codedata) => {
        const { container } = render(<AIModelIcon type="" codedata={codedata} />);
        expectChoreoMark(container);
    });

    it.each(defaultProviders)("ConnectorIcon shows the Choreo mark for %o", (codedata) => {
        const { container } = render(<ConnectorIcon codedata={codedata} />);
        expectChoreoMark(container);
    });

    it("AIModelIcon shows the Choreo mark for a model typed Wso2ModelProvider, which ui-toolkit still maps to the old glyph", () => {
        const { container } = render(<AIModelIcon type="Wso2ModelProvider" />);
        expectChoreoMark(container);
    });

    it("AIModelIcon draws the fallback it is given when nothing else matches", () => {
        const { getByTestId } = render(<AIModelIcon type="UnknownProvider" fallback={<span data-testid="fallback" />} />);
        expect(getByTestId("fallback")).toBeTruthy();
    });

    it("ConnectorIcon shows the Choreo mark for an icon URL the language server tags as the default provider", () => {
        const { container } = render(<ConnectorIcon url="https://example.com/icon.png?wso2_icon" />);
        expectChoreoMark(container);
    });
});

describe("Choreo Cloud knowledge base icon", () => {
    // ballerinax/ai.wso2.integration also ships the voice service, whose registry glyph is bi-audio.
    const cloudKbIcon = "https://bcentral-packageicons.azureedge.net/images/ballerinax_ai.wso2.integration_1.2.0.png";

    it("ConnectorIcon shows the package's Central image, not the voice glyph, for the Choreo integration package's icon URL", () => {
        const { container } = render(<ConnectorIcon url={cloudKbIcon} codedata={{ node: "KNOWLEDGE_BASE" }} />);
        expect(container.querySelector("img")?.getAttribute("src")).toBe(cloudKbIcon);
        expect(container.querySelector(".fw-bi-audio")).toBeNull();
    });
});
