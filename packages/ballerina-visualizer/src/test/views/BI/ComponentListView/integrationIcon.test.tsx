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
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

// L2: a trigger card's icon. A connector that ships its own themed SVG (e.g. ai.azure's Microsoft Foundry,
// whose Central icon does not exist for an unpublished version) shows that SVG, not the kind's generic glyph.
// When every image fails, the generic glyph takes the same 24px slot a brand glyph does: the image size the
// fallback wrapper stamps on it must not reach the glyph, or the card grows taller than its neighbours.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import type { ServiceModel } from "@wso2/ballerina-core";

jest.mock("@wso2/ballerina-core", () => ({
    __esModule: true,
    ...jest.requireActual("../../../../../../ballerina-core/src/icons/brand-icon-registry"),
    ...jest.requireActual("../../../../../../ballerina-core/src/utils/icon-utils"),
    // The real one lives in the LS-client interfaces barrel; its contract is just string -> { url }.
    toIconDescriptor: (icon: any) => (typeof icon === "string" ? { url: icon } : icon),
}));
jest.mock("@wso2/bi-diagram", () => ({ __esModule: true, A2aIcon: () => <span data-testid="a2a" /> }));
// The real ImageWithFallback's contract: no URL (or a failed load) renders the fallback cloned with the image size.
jest.mock("@wso2/ui-toolkit", () => {
    const ReactLib = jest.requireActual("react");
    return {
        __esModule: true,
        Icon: ({ name, style }: any) => <div data-glyph={name} style={style} />,
        ImageWithFallback: ({ imageUrl, fallbackEl, size }: any) => imageUrl
            ? <img src={imageUrl} width={size} height={size} />
            : ReactLib.cloneElement(fallbackEl, { style: { width: size, height: size } }),
    };
});

import { getIntegrationIcon } from "../../../../views/BI/ComponentListView/integrationIcon";

const SVG = `<!-- license -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>`;

function trigger(overrides: Partial<ServiceModel>): ServiceModel {
    return {
        name: "Microsoft Foundry",
        moduleName: "ai.azure",
        orgName: "ballerinax",
        packageName: "ai.azure",
        version: "1.6.0",
        type: "ai",
        listenerProtocol: "",
        icon: "",
        ...overrides,
    } as ServiceModel;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

function render(item: ServiceModel) {
    act(() => root.render(<>{getIntegrationIcon(item)}</>));
}

describe("getIntegrationIcon", () => {
    it("shows the SVG a connector ships, ahead of its Central icon URL", () => {
        render(trigger({ icon: { url: "https://example.invalid/missing.png", light: SVG, dark: SVG } as any }));
        const img = container.querySelector("img");
        expect(img?.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
        expect(container.querySelector("[data-glyph]")).toBeNull();
    });

    it.each([
        ["no icon at all", ""],
        ["an icon descriptor with nothing usable", {}],
    ])("falls back to the kind glyph without the image size, given %s", (_case, icon) => {
        render(trigger({ icon: icon as any }));
        const glyph = container.querySelector("[data-glyph]") as HTMLElement;
        expect(glyph.getAttribute("data-glyph")).toBe("bi-ai-agent");
        expect(glyph.style.width).toBe("");
        expect(glyph.style.height).toBe("");
    });
});

