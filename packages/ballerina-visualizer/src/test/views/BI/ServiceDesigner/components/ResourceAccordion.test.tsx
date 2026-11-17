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

// L2: a trigger's resource handler (e.g. a Foundry hosted agent's `get readiness`) is listed the way an
// HTTP resource is — its accessor is the badge, colored per method — while a non-resource handler keeps
// the generic "Event" badge, and an explicit badge or color from the caller/trigger still wins.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import type { FunctionModel } from "@wso2/ballerina-core";

// The real barrel drags in the LS websocket client; only the path formatter is used here.
jest.mock("@wso2/ballerina-core", () => ({
    __esModule: true,
    toDisplayPath: jest.requireActual("../../../../../../../ballerina-core/src/utils/source-name-utils").toDisplayPath,
}));
jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    Button: ({ children }: any) => <button>{children}</button>,
    Codicon: (): null => null,
    Confirm: (): null => null,
    Icon: (): null => null,
}));
jest.mock("../../../../../components/Skeletons", () => ({
    __esModule: true,
    ResourceAccordionSkeleton: (): null => null,
}));
jest.mock("../../../../../views/BI/ServiceDesigner/utils", () => ({
    __esModule: true,
    canDataBind: () => false,
}));

import { getColorByMethod, ResourceAccordion } from "../../../../../views/BI/ServiceDesigner/components/ResourceAccordion";

const ACCESSORS = ["get", "post", "put", "delete", "patch", "options", "head"];

function fn(kind: FunctionModel["kind"], name: string, accessor?: string, badge?: string): FunctionModel {
    return {
        kind,
        enabled: true,
        optional: false,
        editable: true,
        metadata: badge ? { label: name, description: "", badge } : undefined,
        name: { value: name } as any,
        accessor: accessor ? ({ value: accessor } as any) : undefined,
        parameters: [],
        returnType: { value: "" } as any,
    };
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

function renderBadge(props: Partial<React.ComponentProps<typeof ResourceAccordion>> & { functionModel: FunctionModel }) {
    act(() => {
        root.render(<ResourceAccordion goToSource={() => { }} onResourceImplement={() => { }} {...props} />);
    });
    const header = container.querySelector("[data-testid='service-agent-view-resource']")!;
    const badge = header.querySelector(":scope > div > div > div") as HTMLElement;
    return { text: badge.textContent, color: badge.style.backgroundColor, header: header.textContent };
}

function cssColor(hex: string): string {
    const probe = document.createElement("div");
    probe.style.backgroundColor = hex;
    return probe.style.backgroundColor;
}

describe("ResourceAccordion badge", () => {
    it.each(ACCESSORS)("a %s resource shows its accessor, colored like the HTTP resource list", (accessor) => {
        const { text, color } = renderBadge({ functionModel: fn("RESOURCE", "invocations/[string invocationId]", accessor) });
        expect(text).toBe(accessor.toUpperCase());
        expect(color).toBe(cssColor(getColorByMethod(accessor)));
    });

    it("shows the resource path, path parameters untouched", () => {
        const { header } = renderBadge({ functionModel: fn("RESOURCE", "invocations/[string invocationId]", "get") });
        expect(header).toContain("invocations/[string invocationId]");
    });

    it("keeps an authored badge text and an explicit color over the accessor", () => {
        const { text, color } = renderBadge({
            functionModel: fn("RESOURCE", "readiness", "get", "Probe"),
            badgeColor: "#123456",
        });
        expect(text).toBe("Probe");
        expect(color).toBe(cssColor("#123456"));
    });

    it("leaves a non-resource handler with the generic Event badge", () => {
        const { text, color } = renderBadge({ functionModel: fn("REMOTE", "onMessage") });
        expect(text).toBe("Event");
        expect(color).toBe("");
    });
});
