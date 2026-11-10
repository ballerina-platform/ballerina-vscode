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

// L2: the badge of a handler row. By default it carries a label ("Event", or the model's badge) and the name follows
// it; with nameInBadge the name moves into the badge and appears once, so rows whose labels would all match are told
// apart by name. The optional description follows either way.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { FunctionModel } from "@wso2/ballerina-core";

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    Button: ({ children, onClick, id }: any) => <button id={id} onClick={onClick}>{children}</button>,
    Codicon: (): null => null,
    Icon: (): null => null,
    Confirm: (): null => null,
}));
jest.mock("../../../../../components/Skeletons", () => ({
    __esModule: true,
    ResourceAccordionSkeleton: (): null => null,
}));
jest.mock("../../../../../views/BI/ServiceDesigner/utils", () => ({
    __esModule: true,
    canDataBind: () => false,
}));

import { ResourceAccordion } from "../../../../../views/BI/ServiceDesigner/components/ResourceAccordion";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const handler = (name: string, badge?: string) =>
    ({ name: { value: name }, kind: "REMOTE", metadata: badge ? { badge } : undefined } as unknown as FunctionModel);

describe("ResourceAccordion badge", () => {
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

    const render = (element: React.ReactElement) => act(() => root.render(element));
    const occurrences = (text: string) => container.textContent.split(text).length - 1;

    it.each([
        ["no badge", undefined, "Event"],
        ["a model badge", "Tool", "Tool"],
    ])("labels the badge and follows it with the name when given %s", (_case, badge, label) => {
        render(<ResourceAccordion functionModel={handler("onMessage", badge)} onResourceImplement={jest.fn()} />);

        expect(container.textContent).toContain(label);
        expect(occurrences("onMessage")).toBe(1);
    });

    it.each(["onBytes", "onConnect"])("shows %s once, in the badge, with nameInBadge", (name) => {
        render(<ResourceAccordion functionModel={handler(name, "Ignored")} nameInBadge onResourceImplement={jest.fn()} />);

        expect(occurrences(name)).toBe(1);
        expect(container.textContent).not.toContain("Event");
        expect(container.textContent).not.toContain("Ignored");
    });

    it("follows the badge with the description in either mode", () => {
        render(
            <ResourceAccordion
                functionModel={handler("onBytes")}
                nameInBadge
                description="Runs each time a client sends data"
                onResourceImplement={jest.fn()}
            />
        );

        expect(container.textContent).toBe("onBytesRuns each time a client sends data");
    });

    it("opens the handler when the row is clicked", () => {
        const onResourceImplement = jest.fn();
        const model = handler("onBytes");
        render(<ResourceAccordion functionModel={model} nameInBadge onResourceImplement={onResourceImplement} />);

        act(() => {
            (container.querySelector('[data-testid="service-agent-view-resource"] > div') as HTMLElement).click();
        });

        expect(onResourceImplement).toHaveBeenCalledWith(model);
    });
});
