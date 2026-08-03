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

// L2 (P0): WarningPopup render behaviour (side-panel P0 component). No form context
// needed — a Modal that shows a message and Continue/Cancel actions.

import React from "react";
import { fireEvent, render } from "@testing-library/react";
import WarningPopup from "../components/WarningPopup";

describe("WarningPopup", () => {
    it("renders the given message and both actions when open", () => {
        const { container, getByText } = render(
            <WarningPopup isOpen={true} message="Discard unsaved changes?" onContinue={jest.fn()} onCancel={jest.fn()} />
        );
        expect(container.textContent).toContain("Discard unsaved changes?");
        expect(getByText("Continue")).toBeTruthy();
        expect(getByText("Cancel")).toBeTruthy();
    });

    it("falls back to a default message when none is given", () => {
        const { container } = render(
            <WarningPopup isOpen={true} onContinue={jest.fn()} onCancel={jest.fn()} />
        );
        // some non-empty default warning text is shown
        expect((container.textContent ?? "").length).toBeGreaterThan("ContinueCancel".length);
    });

    it("invokes the callbacks on Continue / Cancel", () => {
        const onContinue = jest.fn();
        const onCancel = jest.fn();
        const { getByText } = render(
            <WarningPopup isOpen={true} message="?" onContinue={onContinue} onCancel={onCancel} />
        );
        fireEvent.click(getByText("Continue"));
        expect(onContinue).toHaveBeenCalledTimes(1);
        fireEvent.click(getByText("Cancel"));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });
});
