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

import { resolveBalTaskCommand } from "../utils/bal-task";

const WIN_SPACED = "C:\\Program Files\\Ballerina\\\\bin\\bal.bat";

describe("resolveBalTaskCommand", () => {
    it("runs a spaced Windows bal path by name with its directory first on PATH", () => {
        const { command, env } = resolveBalTaskCommand(WIN_SPACED, { Path: "C:\\Windows", FOO: "1" }, true);
        expect(command).toBe("bal.bat");
        expect(env.Path).toBe("C:\\Program Files\\Ballerina\\bin;C:\\Windows");
        expect(env.FOO).toBe("1");
        expect(Object.keys(env).filter((key) => key.toUpperCase() === "PATH")).toEqual(["Path"]);
    });

    it("sets PATH when the environment has none", () => {
        const { env } = resolveBalTaskCommand(WIN_SPACED, {}, true);
        expect(env.Path).toBe("C:\\Program Files\\Ballerina\\bin");
    });

    it.each([
        ["Windows path without a space", "C:\\Ballerina\\bin\\bal.bat", true],
        ["bare command", "bal", true],
        ["non-Windows spaced path", "/Users/me/my apps/ballerina/bin/bal", false],
    ])("leaves a %s unchanged", (_name, balCmd, windows) => {
        const env = { PATH: "/usr/bin" };
        expect(resolveBalTaskCommand(balCmd, env, windows)).toEqual({ command: balCmd, env });
    });

    it("never hands a Windows shell a command that needs quoting", () => {
        for (const balCmd of [WIN_SPACED, "C:\\Program Files (x86)\\Ballerina\\bin\\bal.bat", "C:\\Ballerina\\bin\\bal.bat"]) {
            expect(resolveBalTaskCommand(balCmd, {}, true).command).not.toMatch(/[\s"]/);
        }
    });
});
