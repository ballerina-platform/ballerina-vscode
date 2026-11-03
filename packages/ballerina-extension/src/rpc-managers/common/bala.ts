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

import * as fs from 'fs';
import * as path from 'path';

export function getBalaDirPath(projectPath: string): string {
    return path.join(projectPath, 'target', 'bala');
}

/**
 * Returns the `.bala` produced by `bal pack` under `target/bala`. The directory also holds
 * non-bala outputs (e.g. the `.cdx.json` SBOM), so the bala is matched by extension rather
 * than by position. Callers clear the directory before packing, so it holds at most one.
 */
export function getBalaPath(projectPath: string): string | null {
    const balaDirPath = getBalaDirPath(projectPath);
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(balaDirPath, { withFileTypes: true });
    } catch {
        return null;
    }
    const bala = entries.find((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.bala');
    return bala ? path.join(balaDirPath, bala.name) : null;
}
