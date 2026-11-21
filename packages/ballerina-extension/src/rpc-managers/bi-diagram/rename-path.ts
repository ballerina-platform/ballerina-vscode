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

/**
 * The file a rename starts in. A node's line range names it relative to the project (`main.bal`), while the language
 * server reports some locations, such as where a connection's configurable is declared, as absolute paths; joining
 * one of those to the project would name a file that doesn't exist, and the rename would find nothing to rename.
 *
 * @param projectPath the project's root
 * @param fileName    the file, relative to the project or absolute
 */
export function renameFilePath(projectPath: string, fileName: string): string {
    return path.isAbsolute(fileName) ? fileName : path.join(projectPath, fileName);
}
