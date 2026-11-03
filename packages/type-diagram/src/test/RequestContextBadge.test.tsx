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
import { ServiceSettingsBadge } from "../components/entity-relationship/EntityNode/EntityHead/ServiceSettingsBadge";

const items = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ label: `Setting ${i + 1}`, summary: `value ${i + 1}` }));

describe("ServiceSettingsBadge", () => {
    it("renders nothing when no setting is set", () => {
        const { container } = render(<ServiceSettingsBadge summary={{ items: [] }} onOpen={jest.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it.each([1, 2, 5, 14])("shows the number of settings set (%i) and names it for screen readers", (count) => {
        render(<ServiceSettingsBadge summary={{ items: items(count) }} onOpen={jest.fn()} />);
        const badge = screen.getByTestId("service-settings-badge");
        expect(badge).toHaveTextContent(String(count));
        expect(badge).toHaveAccessibleName(
            `${count} service setting${count === 1 ? "" : "s"} set. Open Service Settings`);
    });

    it("opens the settings on click without the click reaching the node", () => {
        const onOpen = jest.fn();
        const onNodeClick = jest.fn();
        render(
            <div onClick={onNodeClick}>
                <ServiceSettingsBadge summary={{ items: items(2) }} onOpen={onOpen} />
            </div>
        );
        fireEvent.click(screen.getByTestId("service-settings-badge"));
        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onNodeClick).not.toHaveBeenCalled();
    });
});
