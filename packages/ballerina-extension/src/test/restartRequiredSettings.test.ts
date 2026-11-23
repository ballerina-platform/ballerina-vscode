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

import { Uri, workspace } from "vscode";
import { ENABLE_BALLERINA_INTEGRATOR, onRestartRequiredSettingChange } from "../core/preferences";

const folderUri = { toString: () => "file:///proj-a" } as Uri;
const settings: Record<string, unknown> = { [ENABLE_BALLERINA_INTEGRATOR]: true };
const folderSettings: Record<string, unknown> = {};
let fireConfigurationChange: () => void = () => undefined;

beforeEach(() => {
    jest.replaceProperty(workspace, "workspaceFolders", [{ uri: folderUri, name: "proj-a", index: 0 }]);
    jest.spyOn(workspace, "getConfiguration").mockImplementation((_section?: string, scope?: any) => ({
        get: (key: string) => (scope === folderUri && key in folderSettings ? folderSettings[key] : settings[key]),
    } as any));
    jest.spyOn(workspace, "onDidChangeConfiguration").mockImplementation((listener: any) => {
        fireConfigurationChange = listener;
        return { dispose() {} };
    });
});

describe("Restart-required settings", () => {
    it("ignores a change event whose watched values are unchanged", () => {
        const listener = jest.fn();
        onRestartRequiredSettingChange(listener);

        fireConfigurationChange();

        expect(listener).not.toHaveBeenCalled();
    });

    it("notifies once when a watched value changes", () => {
        const listener = jest.fn();
        onRestartRequiredSettingChange(listener);

        settings[ENABLE_BALLERINA_INTEGRATOR] = false;
        fireConfigurationChange();
        fireConfigurationChange();

        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("notifies when a watched value changes only in one folder", () => {
        const listener = jest.fn();
        onRestartRequiredSettingChange(listener);

        folderSettings[ENABLE_BALLERINA_INTEGRATOR] = !settings[ENABLE_BALLERINA_INTEGRATOR];
        fireConfigurationChange();

        expect(listener).toHaveBeenCalledTimes(1);
    });
});
