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

/**
 * @jest-environment node
 *
 * renameIdentifier takes the file a rename starts in relative to the project (a node's line range) or absolute (where
 * the language server says a connection's configurable is declared). Joining an absolute path to the project named a
 * file that doesn't exist, so renaming a connection's configurable found nothing to rename.
 */

import * as path from "path";
import { renameFilePath } from "../rpc-managers/bi-diagram/rename-path";

const PROJECT = path.resolve("/work/kafka_app");

describe("renameFilePath", () => {
    it("resolves a file named relative to the project inside it", () => {
        expect(renameFilePath(PROJECT, "main.bal")).toBe(path.join(PROJECT, "main.bal"));
        expect(renameFilePath(PROJECT, path.join("modules", "db", "db.bal")))
            .toBe(path.join(PROJECT, "modules", "db", "db.bal"));
    });

    it("INVARIANT: keeps an absolute path as it is, rather than nesting it in the project", () => {
        const declaredIn = path.join(PROJECT, "config.bal");
        expect(renameFilePath(PROJECT, declaredIn)).toBe(declaredIn);
    });
});
