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

import * as path from "path";
import { workspace } from "vscode";
import { saveDocument } from "../../features/ai/utils/project/unsaved-documents";
import type {
    ConfigurableRenameEditsRequest,
    ConfigurableRenameEditsResponse,
    TextEdit
} from "@wso2/ballerina-core";

const CONFIG_TOML = "Config.toml";

/**
 * Saves each Config.toml open with unsaved changes. The language server reads Config.toml from disk, while the
 * extension applies its edits to the open document: unsaved text would take them at the wrong places.
 *
 * @param projectPath only the Config.toml files of this project, if given; every open one otherwise
 * @returns why it couldn't save one, or undefined once all are saved
 */
export async function saveOpenConfigTomls(projectPath?: string): Promise<string | undefined> {
    const inProject = (fileName: string) => {
        if (!projectPath) {
            return true;
        }
        const relative = path.relative(projectPath, fileName);
        return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
    };
    const saved = await Promise.all(workspace.textDocuments
        .filter((document) => document.isDirty && path.basename(document.fileName) === CONFIG_TOML
            && inProject(document.fileName))
        .map((document) => saveDocument(document)));
    return saved.includes(false) ? "Config.toml has unsaved changes that could not be saved." : undefined;
}

/** The Config.toml edits that rename a configurable's value with it, by file, or why it can't be renamed. */
export type ConfigTomlRenameEdits = { edits: { [file: string]: TextEdit[] } } | { error: string };

/**
 * The Config.toml edits of renaming a configurable, worked out by the language server from the files as saved: any
 * open Config.toml with unsaved changes is saved first. When the value can't be renamed (a Config.toml already has
 * a value for the new name, or couldn't be saved), the error says why, and the caller renames nothing.
 *
 * @param request    the configurable, its new name, and a file of its project
 * @param fetchEdits asks the language server for the edits
 */
export async function configTomlRenameEdits(
    request: ConfigurableRenameEditsRequest,
    fetchEdits: (request: ConfigurableRenameEditsRequest) => Promise<ConfigurableRenameEditsResponse>
): Promise<ConfigTomlRenameEdits> {
    const unsaved = await saveOpenConfigTomls();
    if (unsaved) {
        return { error: unsaved };
    }
    const response = await fetchEdits(request);
    if (!response || response.errorMsg) {
        return { error: response?.errorMsg ?? "The language server did not answer." };
    }
    return { edits: response.textEdits ?? {} };
}
