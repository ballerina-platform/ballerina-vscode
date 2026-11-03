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
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { RequestContextBadge } from "../components/entity-relationship/EntityNode/EntityHead/RequestContextBadge";

const keys = (count: number) => Array.from({ length: count }, (_, i) => `key${i + 1}`);

describe("RequestContextBadge", () => {
    it("reads as Context alone when the context carries no values yet", () => {
        render(<RequestContextBadge context={{ functionName: "graphqlContextInit", keys: [] }} onOpen={jest.fn()} />);
        const badge = screen.getByTestId("request-context-badge");
        expect(badge).toHaveTextContent(/^Context$/);
        expect(badge).toHaveAccessibleName("Request context. Open Request Context");
    });

    it.each([1, 2, 7])("shows the number of values the context carries (%i)", (count) => {
        render(<RequestContextBadge context={{ functionName: "ctx", keys: keys(count) }} onOpen={jest.fn()} />);
        const badge = screen.getByTestId("request-context-badge");
        expect(badge).toHaveTextContent(`Context ${count}`);
        expect(badge).toHaveAccessibleName(
            `Request context with ${count} value${count === 1 ? "" : "s"}. Open Request Context`);
    });

    it("opens the editor on click without the click reaching the node", () => {
        const onOpen = jest.fn();
        const onNodeClick = jest.fn();
        render(
            <div onClick={onNodeClick}>
                <RequestContextBadge context={{ keys: keys(2) }} onOpen={onOpen} />
            </div>
        );
        fireEvent.click(screen.getByTestId("request-context-badge"));
        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onNodeClick).not.toHaveBeenCalled();
    });
});
