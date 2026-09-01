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

// L2: what the form actually shows for a `readonly & record` field. The dispatcher picks a
// renderer by `typeName`, so an un-normalized intersection is not just mislabelled — it is a leaf
// with no way to reach the fields inside it (product-integrator#1839). Rendered from the captured
// graphql payload with the field pre-selected, so no click is needed: jsdom trips on the
// requestAnimationFrame work that a real click would start.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

import { TypeField } from "@wso2/ballerina-core";
import { loadFixture } from "@wso2/test-config/fixtures";

// The core barrel pulls in ESM-only LS transport modules that jest cannot load. `keywords` (read
// by utils/getFieldName to escape reserved field names) is all this tree needs from it.
jest.mock("@wso2/ballerina-core", () => ({ __esModule: true, keywords: [] as string[] }));

// Stubbed so the assertions read the rendered labels, not a toolkit abstraction over them.
jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
    Codicon: (): null => null,
    Dropdown: (): null => null,
    Tooltip: ({ children }: any) => <>{children}</>,
    Typography: ({ children, className }: any) => <span className={className}>{children}</span>,
    ThemeColors: new Proxy({}, { get: () => "#000" }),
}));

jest.mock("@vscode/webview-ui-toolkit/react", () => ({
    __esModule: true,
    VSCodeCheckbox: ({ checked, onClick }: any) => <input type="checkbox" readOnly checked={!!checked} onClick={onClick} />,
}));

import { ParameterBranch } from "./ParameterBranch";
import { normalizeIntersections } from "./utils/intersection";

(global as any).IS_REACT_ACT_ENVIRONMENT = true;

const GRAPHQL_CONFIG = "graphql-resource-config.json";

/** The captured record config, with the `readonly & ServerCacheConfig` field ticked. */
function graphqlResourceConfig(): TypeField {
    const { recordConfig } = loadFixture(__dirname, "utils", "fixtures", "recordConfigs", GRAPHQL_CONFIG) as
        { recordConfig: TypeField };
    const cacheConfig = recordConfig.fields?.find((field) => field.name === "cacheConfig");
    expect(cacheConfig).toBeDefined();
    cacheConfig!.selected = true;
    return recordConfig;
}

describe("ParameterBranch on a readonly & record field", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const renderFields = (config: TypeField) => {
        act(() => {
            root.render(
                <ParameterBranch parameters={config.fields ?? []} depth={1} onChange={(): void => undefined} />
            );
        });
        return container.textContent ?? "";
    };

    it("opens the fields of the intersected record once normalized", () => {
        const text = renderFields(normalizeIntersections(graphqlResourceConfig()));

        expect(text).toContain("cacheConfig");
        expect(text).toContain("ServerCacheConfig");
        ["enabled", "maxAge", "maxSize"].forEach((field) => expect(text).toContain(field));
    });

    it("never labels a field with the `intersection` type name", () => {
        expect(renderFields(normalizeIntersections(graphqlResourceConfig()))).not.toContain("intersection");
    });

    it("is a dead end without normalization", () => {
        // Pins what the fix changes: the leaf renderer shows the raw type name and nothing opens.
        const text = renderFields(graphqlResourceConfig());

        expect(text).toContain("intersection");
        expect(text).not.toContain("enabled");
    });
});
