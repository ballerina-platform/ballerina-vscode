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

export interface TestFunctionId {
    projectPath: string;
    fileName: string;
    functionName: string;
}

/**
 * Splits a test function item's ID, `test:${projectPath}:${fileName}:${functionName}`.
 * The project path can itself contain ':' (a Windows drive letter), so the file and function names are read
 * from the end; neither can contain ':'.
 */
export function parseTestFunctionId(id: string): TestFunctionId | undefined {
    const parts = id.split(':');
    if (parts.length < 4 || parts[0] !== 'test') {
        return undefined;
    }
    return {
        projectPath: parts.slice(1, -2).join(':'),
        fileName: parts[parts.length - 2],
        functionName: parts[parts.length - 1],
    };
}
