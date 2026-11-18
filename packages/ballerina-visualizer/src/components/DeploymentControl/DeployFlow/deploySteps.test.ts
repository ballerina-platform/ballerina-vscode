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

jest.mock("@wso2/ballerina-rpc-client", () => ({ __esModule: true }));
// The wizard styles some of these components, so each mock is a plain element.
jest.mock("@wso2/ui-toolkit", () => ({ __esModule: true, Button: "button", CheckBox: "input", Dropdown: "select", ProgressRing: "div", TextField: "input" }));
jest.mock("@vscode/webview-ui-toolkit/react", () => ({ __esModule: true, VSCodeLink: "a" }));
jest.mock("../shared", () => ({
    __esModule: true, Actions: "div", DeployIcon: "i", DeployPopup: "div", Dot: "span", MarkBox: "span", PlayLabel: "span", Row: "div", SUCCESS: "", Spinner: "span", Stack: "div",
}));
jest.mock("../AgentManagerConfigFields", () => ({ __esModule: true, ErrorText: "span", Muted: "span" }));

import type { DeploySource, DeployStatus } from "./deployBackend";
import { isOnRemote, isPushed } from "./deployBackend";
import { firstOpenStep } from "./DeployWizard";

const source = (overrides: Partial<DeploySource> = {}): DeploySource => ({
    repository: "acme/orders", branches: ["main"], branch: "main", prepItems: [], changedFiles: 0, unpushedCommits: 0, ...overrides,
});

describe("Where the source stands", () => {
    it.each<[string, Partial<DeploySource>, boolean, boolean]>([
        ["no repository", { repository: undefined }, false, false],
        ["everything pushed", {}, true, true],
        ["uncommitted changes only", { changedFiles: 2 }, true, false],
        ["unpushed commits", { unpushedCommits: 1 }, false, false],
        ["the folder missing on the remote branch", { missingOnRemote: true }, false, false],
        ["Prepare's files not pushed", { prepUnpushed: true }, false, true],
    ])("%s", (_case, overrides, onRemote, pushed) => {
        expect(isOnRemote(source(overrides))).toBe(onRemote);
        expect(isPushed(source(overrides))).toBe(pushed);
    });
});

describe("The wizard's first step", () => {
    const running: DeployStatus = { signedIn: true, run: { steps: [], live: false } };

    it("opens on Deploy while a deploy runs", () => {
        expect(firstOpenStep(source({ unpushedCommits: 3 }), running)).toBe("deploy");
    });

    it("opens on Prepare until its items are done", () => {
        expect(firstOpenStep(source({ prepItems: [{ id: "spec", label: "Spec", detail: "", done: false }] }))).toBe("prepare");
    });

    it("skips optional Prepare items", () => {
        expect(firstOpenStep(source({ prepItems: [{ id: "tracing", label: "Tracing", detail: "", done: false, optional: true }] }))).toBe("configure");
    });

    it("opens on Push while the source is not on GitHub", () => {
        expect(firstOpenStep(source({ missingOnRemote: true }))).toBe("push");
    });

    it("opens on Configure once the source is on GitHub", () => {
        expect(firstOpenStep(source(), { signedIn: true })).toBe("configure");
    });

    it("opens on Push for a registered agent, which has no Configure step", () => {
        expect(firstOpenStep(source(), { signedIn: true, registered: true })).toBe("push");
    });
});
