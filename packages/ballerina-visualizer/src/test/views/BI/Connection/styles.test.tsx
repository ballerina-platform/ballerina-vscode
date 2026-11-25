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

// L2: the shared connection popup must fit the webview. It is centred, so any height beyond the
// viewport's is cut off at both ends, taking its header and its action button out of reach.
// (wso2/product-integrator#1543: with the IDE's bottom panel open the webview can be under 480px.)

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    ThemeColors: new Proxy({}, { get: () => "#000" }),
    Button: ({ className }: any) => <button className={className} />,
    Codicon: ({ className }: any) => <i className={className} />,
    Overlay: ({ className }: any) => <div className={className} />,
    Typography: ({ className }: any) => <p className={className} />,
}));

import { PopupContainer } from "../../../../views/BI/Connection/styles";
import { declaredValue, resolveLength } from "../../../cssRules";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Room left above and below the popup, so its rounded corners and shadow stay on screen.
const MARGIN = 16;
// The popup's minimum height in a webview with room to spare.
const PREFERRED_MIN_HEIGHT = 480;

describe("PopupContainer", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        act(() => root.render(<PopupContainer data-testid="popup" />));
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const popup = () => container.querySelector('[data-testid="popup"]') as HTMLElement;

    it.each([200, 300, 400, PREFERRED_MIN_HEIGHT, 600])(
        "leaves the popup on screen in a %ipx webview",
        (viewportHeight) => {
            // min-height wins over max-height and height, so it alone decides the floor.
            const minHeight = declaredValue(popup(), "min-height");
            expect(minHeight).toBeDefined();
            expect(resolveLength(minHeight!, viewportHeight)).toBeLessThanOrEqual(viewportHeight - 2 * MARGIN);
        }
    );

    it.each([800, 1200])("keeps its minimum height in a %ipx webview", (viewportHeight) => {
        const minHeight = declaredValue(popup(), "min-height");
        expect(minHeight).toBeDefined();
        expect(resolveLength(minHeight!, viewportHeight)).toBe(PREFERRED_MIN_HEIGHT);
    });
});
