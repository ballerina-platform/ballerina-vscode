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
// L2 component render. The badge is a foreignObject painted over a capability circle and it
// keeps pointer events for its tooltip, so it swallows the circle's clicks unless the host
// forwards a handler — these cover that contract in both directions.

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ApprovalBadge } from "../components/nodes/AgentWidget/ApprovalBadge";

const renderBadge = (onClick?: () => void) =>
    render(
        <svg>
            <ApprovalBadge background="#fff" onClick={onClick} />
        </svg>
    );

describe("ApprovalBadge", () => {
    it("renders the shield with its approval tooltip", () => {
        renderBadge();
        expect(screen.getByText("Requires Approval")).toBeInTheDocument();
    });

    it("forwards a click to the handler the host supplies", () => {
        const onClick = jest.fn();
        const { container } = renderBadge(onClick);

        fireEvent.click(container.querySelector("foreignObject > div > div")!);

        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("swallows the click when the host supplies no handler", () => {
        // The durable agent passes undefined for a tool, whose circle is not clickable either;
        // the badge must not become the one clickable part of an inert capability.
        const { container } = renderBadge(undefined);
        const badge = container.querySelector("foreignObject > div > div")!;

        expect(() => fireEvent.click(badge)).not.toThrow();
        expect(badge).toHaveStyle({ cursor: "default" });
    });

    it("shows a pointer cursor only when it is clickable", () => {
        const { container } = renderBadge(jest.fn());

        expect(container.querySelector("foreignObject > div > div")!).toHaveStyle({ cursor: "pointer" });
    });
});
