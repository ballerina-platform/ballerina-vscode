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

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { extensions } from "vscode";
import { ExtendedLangClient } from "../../src/core/extended-language-client";

const PROJECT_ROOT = path.join(__dirname, "..", "..", "..", "test", "data");
const EXPECTED_DIR = path.join(__dirname, "..", "..", "..", "test", "workflow", "resources", "expected");

/**
 * Workflow overview snapshot tests.
 *
 * These tests exercise the `designModelService/getDesignModel` endpoint against workflow
 * projects and snapshot the workflow-related parts of the design model: workflow nodes with
 * data events, human tasks and activities, run/sendData sender attribution (per function and
 * per service/automation), activity connections, and invalid sendData tracking (data event
 * names that are renamed, unresolvable, or sent through helper functions).
 *
 * Snapshots are stored in `test/workflow/resources/expected`. To regenerate them after an
 * intentional model change, run the tests once with UPDATE_WORKFLOW_SNAPSHOTS=true and review
 * the diff before committing.
 */

const SNAPSHOT_PROJECTS = [
    {
        name: "workflow_events_project",
        description: "workflows with data events, human tasks, activities and connections",
    },
    {
        name: "workflow_invalid_send_data_project",
        description: "sendData calls with renamed, dynamic and helper-propagated event names",
    },
];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalizes a design model so that it is stable across machines and runs:
 * - absolute file paths are made project-relative
 * - arrays of objects are sorted by their stable, non-generated keys
 * - uuids are replaced by symbolic placeholders assigned in traversal order
 * - arrays of uuid placeholders are sorted
 */
function normalizeDesignModel(designModel: unknown, projectPath: string): unknown {
    const relativized = relativizePaths(designModel, projectPath);
    const sorted = sortObjectArrays(relativized);
    // Assign placeholders by node definition order (each node's own "uuid" field) so the
    // numbering is stable regardless of the hash ordering of uuid reference sets
    const uuidMap = new Map<string, string>();
    collectDefinedUuids(sorted, uuidMap);
    const symbolized = mapUuids(sorted, uuidMap);
    return sortUuidArrays(symbolized);
}

function collectDefinedUuids(value: unknown, uuidMap: Map<string, string>): void {
    if (Array.isArray(value)) {
        value.forEach((item) => collectDefinedUuids(item, uuidMap));
        return;
    }
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        const uuid = record["uuid"];
        if (typeof uuid === "string" && UUID_PATTERN.test(uuid) && !uuidMap.has(uuid)) {
            uuidMap.set(uuid, `<uuid-${uuidMap.size + 1}>`);
        }
        Object.values(record).forEach((item) => collectDefinedUuids(item, uuidMap));
    }
}

function relativizePaths(value: unknown, projectPath: string): unknown {
    if (typeof value === "string") {
        if (value.includes(projectPath)) {
            return value.substring(value.indexOf(projectPath) + projectPath.length + 1).replace(/\\/g, "/");
        }
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => relativizePaths(item, projectPath));
    }
    if (value && typeof value === "object") {
        const result: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value)) {
            result[key] = relativizePaths(item, projectPath);
        }
        return result;
    }
    return value;
}

function sortKeyOf(item: unknown): string {
    if (!item || typeof item !== "object") {
        return JSON.stringify(item) ?? "";
    }
    const record = item as Record<string, unknown>;
    const keys = ["sortText", "symbol", "name", "accessor", "path", "absolutePath", "displayName"];
    const parts = keys.map((key) => (typeof record[key] === "string" ? (record[key] as string) : ""));
    return parts.join("|");
}

function sortObjectArrays(value: unknown): unknown {
    if (Array.isArray(value)) {
        const mapped = value.map((item) => sortObjectArrays(item));
        if (mapped.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
            return [...mapped].sort((a, b) => sortKeyOf(a).localeCompare(sortKeyOf(b)));
        }
        return mapped;
    }
    if (value && typeof value === "object") {
        const result: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value)) {
            result[key] = sortObjectArrays(item);
        }
        return result;
    }
    return value;
}

function mapUuids(value: unknown, uuidMap: Map<string, string>): unknown {
    if (typeof value === "string" && UUID_PATTERN.test(value)) {
        return uuidMap.get(value) ?? "<uuid-undefined>";
    }
    if (Array.isArray(value)) {
        return value.map((item) => mapUuids(item, uuidMap));
    }
    if (value && typeof value === "object") {
        // Map keys too: e.g. workflowSendData is keyed by workflow uuid. Sort mapped keys so
        // hash-ordered maps serialize deterministically
        const entries = Object.entries(value).map(([key, item]): [string, unknown] => [
            UUID_PATTERN.test(key) ? uuidMap.get(key) ?? "<uuid-undefined>" : key,
            mapUuids(item, uuidMap),
        ]);
        if (entries.length > 0 && entries.every(([key]) => /^<uuid-\d+>$/.test(key))) {
            entries.sort(([a], [b]) => a.localeCompare(b));
        }
        const result: Record<string, unknown> = {};
        for (const [key, item] of entries) {
            result[key] = item;
        }
        return result;
    }
    return value;
}

function sortUuidArrays(value: unknown): unknown {
    if (Array.isArray(value)) {
        const mapped = value.map((item) => sortUuidArrays(item));
        if (mapped.length > 0 && mapped.every((item) => typeof item === "string" && /^<uuid-\d+>$/.test(item))) {
            return [...mapped].sort();
        }
        return mapped;
    }
    if (value && typeof value === "object") {
        const result: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value)) {
            result[key] = sortUuidArrays(item);
        }
        return result;
    }
    return value;
}

suite("Workflow Overview Design Model Snapshot Tests", function () {
    this.timeout(120000);
    let langClient: ExtendedLangClient;

    suiteSetup(async function () {
        // Use the language client of the activated extension instead of starting a second one
        const balExt = extensions.getExtension("wso2.ballerina");
        assert.ok(balExt, "wso2.ballerina extension not found");
        const api = await balExt.activate();
        const ballerinaExtInstance = api?.ballerinaExtInstance;
        assert.ok(ballerinaExtInstance, "Ballerina extension instance not available");

        // Wait until the language client is initialized by the extension
        const deadline = Date.now() + 60000;
        while (!ballerinaExtInstance.langClient && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        langClient = ballerinaExtInstance.langClient as ExtendedLangClient;
        assert.ok(langClient, "Ballerina language client did not initialize in time");
    });

    for (const project of SNAPSHOT_PROJECTS) {
        test(`design model snapshot: ${project.name} (${project.description})`, async function () {
            const projectPath = path.join(PROJECT_ROOT, project.name);
            const response = await langClient.getDesignModel({ projectPath });

            assert.ok(response && (response as any).designModel, `No design model returned for ${project.name}`);
            const normalized = normalizeDesignModel((response as any).designModel, projectPath);
            const actual = JSON.stringify(normalized, null, 2) + "\n";

            const expectedPath = path.join(EXPECTED_DIR, `${project.name}.json`);
            if (process.env.UPDATE_WORKFLOW_SNAPSHOTS === "true" || !fs.existsSync(expectedPath)) {
                fs.mkdirSync(EXPECTED_DIR, { recursive: true });
                fs.writeFileSync(expectedPath, actual, "utf-8");
                assert.ok(
                    process.env.UPDATE_WORKFLOW_SNAPSHOTS === "true",
                    `Snapshot for ${project.name} did not exist and was generated at ${expectedPath}. ` +
                    "Review and commit it, then re-run the tests."
                );
            }

            const expected = fs.readFileSync(expectedPath, "utf-8");
            assert.strictEqual(
                actual,
                expected,
                `Design model snapshot mismatch for "${project.name}". If the change is intentional, ` +
                `re-run with UPDATE_WORKFLOW_SNAPSHOTS=true and review the diff of ${expectedPath}.`
            );
        });
    }
});
