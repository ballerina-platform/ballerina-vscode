// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import * as assert from "assert";
import * as path from "path";
import * as fs from "fs";
import { Library } from "../../../../src/features/ai/utils/libs/library-types";
import { toSyntaxString } from "../../../../src/features/ai/utils/libs/to-syntax-string";

const INPUT_DIR = path.join(__dirname, "resources", "input");
const EXPECTED_DIR = path.join(__dirname, "resources", "expected");

/**
 * Writes the actual output as the expected .txt file, to bootstrap a snapshot for a new input.
 *
 * Opt-in via `UPDATE_SNAPSHOTS=1`, and deliberately NOT called on a normal run. It used to be invoked
 * unconditionally on every test, immediately before the comparison — which overwrote the expected file
 * with whatever the renderer had just produced and then compared it to itself. The assertion could not
 * fail, so the suite reported success while protecting nothing.
 *
 * To re-baseline after an intended rendering change:
 *   UPDATE_SNAPSHOTS=1 npx mocha --require ts-node/register/transpile-only --ui tdd <this file>
 * then read the diff before committing it.
 */
function updateExpected(name: string, actual: string): void {
    if (!fs.existsSync(EXPECTED_DIR)) {
        fs.mkdirSync(EXPECTED_DIR, { recursive: true });
    }
    fs.writeFileSync(path.join(EXPECTED_DIR, `${name}.txt`), actual, "utf-8");
}

/**
 * Discovers all .json files in the input directory.
 */
function discoverInputs(): string[] {
    if (!fs.existsSync(INPUT_DIR)) {
        return [];
    }
    return fs.readdirSync(INPUT_DIR)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(/\.json$/, ""));
}

suite("toSyntaxString — snapshot tests", () => {
    const inputs = discoverInputs();

    if (inputs.length === 0) {
        test("no input files found", () => {
            assert.fail("No .json files found in resources/input/. Add at least one input file.");
        });
        return;
    }

    for (const name of inputs) {
        test(`snapshot: ${name}`, () => {
            const inputPath = path.join(INPUT_DIR, `${name}.json`);
            const expectedPath = path.join(EXPECTED_DIR, `${name}.txt`);

            const libraries: Library[] = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
            const actual = toSyntaxString(libraries);

            if (process.env.UPDATE_SNAPSHOTS === "1") {
                updateExpected(name, actual);
            }

            assert.ok(
                fs.existsSync(expectedPath),
                `Expected file not found: ${expectedPath}. Run tests once with updateExpected enabled to generate it.`
            );

            const expected = fs.readFileSync(expectedPath, "utf-8");
            assert.strictEqual(actual, expected, `Snapshot mismatch for "${name}". If the change is intentional, delete ${expectedPath} and re-run to regenerate.`);
        });
    }
});
