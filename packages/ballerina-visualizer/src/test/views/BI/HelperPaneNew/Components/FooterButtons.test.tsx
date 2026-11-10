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
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("@wso2/ui-toolkit", () => ({
    Icon: (): null => null,
    ThemeColors: new Proxy({}, { get: () => "inherit" }),
}));

// FooterButtons relies on the automatic JSX runtime, which the test transform does not apply.
Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

import FooterButtons from "../../../../../views/BI/HelperPaneNew/Components/FooterButtons";

// L2: a helper pane's footer action ("+ New Variable", "+ New Function", ...) is a button inside a row
// that takes clicks too. Wherever in the row a click lands, an enabled action runs once, and a disabled
// one (issue-1770: "+ New Variable" while its template is on its way) does not run.
describe("FooterButtons", () => {
    const targets: [string, (row: HTMLElement) => HTMLElement][] = [
        ["the button", (row) => row.querySelector("button")!],
        ["the label inside the button", (row) => row.querySelector("span")!],
        ["the row around the button", (row) => row],
    ];

    function clickFooter(disabled: boolean, target: (row: HTMLElement) => HTMLElement): jest.Mock {
        const onClick = jest.fn();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        try {
            act(() => root.render(<FooterButtons title="New Variable" onClick={onClick} disabled={disabled} />));
            const row = container.querySelector("button")!.parentElement!;
            act(() => { target(row).click(); });
        } finally {
            act(() => root.unmount());
            container.remove();
        }
        return onClick;
    }

    test.each(targets)("runs its action once for a click on %s", (_name, target) => {
        expect(clickFooter(false, target)).toHaveBeenCalledTimes(1);
    });

    test.each(targets)("runs nothing for a click on %s while disabled", (_name, target) => {
        expect(clickFooter(true, target)).not.toHaveBeenCalled();
    });
});
