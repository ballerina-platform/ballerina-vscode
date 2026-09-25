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

jest.mock("../stateMachine", () => ({ StateMachine: {} }));
jest.mock("../utils/runCommand", () => ({ runCommandWithOutput: jest.fn() }));
jest.mock("../utils/logger", () => ({ buildOutputChannel: {} }));
jest.mock("../utils/config", () => ({ quoteShellPath: (value: string) => value }));
jest.mock("../BalExtensionContext", () => ({ extension: {} }));

import { compareVersions, findVersionEntry, TomlTable } from "../features/project/connector-upgrade";

describe("compareVersions", () => {
    it.each([
        ["1.10.0", "1.9.0"],
        ["2.0.0", "1.99.99"],
        ["2.0.0", "2.0.0-beta"],
        ["5.1.0-alpha.5", "5.1.0-alpha.4"],
        ["1.0.0-alpha.10", "1.0.0-alpha.2"],
        ["1.0.0-alpha.beta", "1.0.0-alpha.1"],
        ["1.0.0-alpha.1", "1.0.0-alpha"],
        ["1.0.0-rc.1", "1.0.0-beta.11"],
    ])("ranks %s above %s", (higher, lower) => {
        expect(compareVersions(higher, lower)).toBeGreaterThan(0);
        expect(compareVersions(lower, higher)).toBeLessThan(0);
    });

    it.each([
        ["1.2.3", "1.2.3"],
        ["1.2.3-beta.1", "1.2.3-beta.1"],
        ["1.2.3+build.5", "1.2.3"],
        ["1.2", "1.2.0"],
    ])("treats %s and %s as equal", (left, right) => {
        expect(compareVersions(left, right)).toBe(0);
    });
});

describe("findVersionEntry", () => {
    it("finds the pin of the matching dependency", () => {
        const text = [
            "[[dependency]]",
            'org = "ballerinax"',
            'name = "rabbitmq"',
            'version = "3.1.0"',
            "",
            "[[dependency]]",
            'org = "ballerinax"',
            'name = "kafka"',
            'version = "4.4.0"',
        ].join("\n");

        const entry = findVersionEntry(text, TomlTable.Dependency, "ballerinax", "kafka");

        expect(entry?.version).toBe("4.4.0");
        expect(text.slice(entry.start, entry.start + entry.version.length)).toBe("4.4.0");
    });

    it("keeps scanning the table past a comment containing brackets", () => {
        const text = [
            "[[dependency]]",
            'org = "ballerinax"',
            'name = "kafka"',
            "# [connector version]",
            'version = "4.4.0"',
        ].join("\n");

        expect(findVersionEntry(text, TomlTable.Dependency, "ballerinax", "kafka")?.version).toBe("4.4.0");
    });

    it("does not read the version of the next table", () => {
        const text = [
            "[[dependency]]",
            'org = "ballerinax"',
            'name = "kafka"',
            "",
            "[package]",
            'version = "0.1.0"',
        ].join("\n");

        expect(findVersionEntry(text, TomlTable.Dependency, "ballerinax", "kafka")).toBeUndefined();
    });

    it("reads a locked version past an inline dependencies array", () => {
        const text = [
            "[[package]]",
            'org = "ballerinax"',
            'name = "kafka"',
            'version = "4.5.0"',
            "dependencies = [",
            '\t{org = "ballerina", name = "io"}',
            "]",
            "",
            "[[package]]",
            'org = "ballerina"',
            'name = "io"',
            'version = "1.6.0"',
        ].join("\n");

        expect(findVersionEntry(text, TomlTable.Package, "ballerinax", "kafka")?.version).toBe("4.5.0");
        expect(findVersionEntry(text, TomlTable.Package, "ballerina", "io")?.version).toBe("1.6.0");
    });
});
