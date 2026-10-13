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

export interface BalTaskCommand {
    command: string;
    env: { [key: string]: string };
}

/**
 * On Windows, a bal path with a space is run by name with its directory first on PATH. cmd.exe strips the
 * outer quotes of a command line holding more than two, which breaks a quoted path once any argument is quoted.
 */
export function resolveBalTaskCommand(
    balCmd: string, env: { [key: string]: string | undefined }, windows: boolean
): BalTaskCommand {
    const taskEnv = { ...env } as { [key: string]: string };
    if (!windows || !/\s/.test(balCmd) || !path.win32.isAbsolute(balCmd)) {
        return { command: balCmd, env: taskEnv };
    }
    const binDir = path.win32.dirname(path.win32.normalize(balCmd));
    // Windows env keys are case-insensitive; reuse the existing spelling (usually 'Path')
    const pathKey = Object.keys(taskEnv).find((key) => key.toUpperCase() === "PATH") ?? "Path";
    taskEnv[pathKey] = taskEnv[pathKey] ? `${binDir};${taskEnv[pathKey]}` : binDir;
    return { command: path.win32.basename(balCmd), env: taskEnv };
}
