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

// L1 — the Ballerina.toml edits behind the ICP toggle (`rpc-managers/icp-service/build-options`).
// Invariants over a corpus of manifests: after enabling, every ICP build option is `true`
// exactly once inside [build-options] and nothing else changes; after disabling, no ICP build
// option is left and the user's own options survive. Enable is idempotent, and disable undoes
// an enable on a manifest that had no ICP options to begin with.

import { parse } from "@iarna/toml";
import {
    addICPBuildOptions,
    ICP_BUILD_OPTION_KEYS,
    removeICPBuildOptions,
} from "../rpc-managers/icp-service/build-options";

const PACKAGE = `[package]
org = "acme"
name = "orders"
version = "0.1.0"
distribution = "2201.13.0"
`;

const MANIFESTS: Record<string, string> = {
    "no build-options section": PACKAGE,
    "no trailing newline": PACKAGE.trimEnd(),
    "empty build-options section": `${PACKAGE}\n[build-options]\n`,
    "other build options": `${PACKAGE}\n[build-options]\nsticky = true\n`,
    "build-options before another table": `${PACKAGE}\n[build-options]\nsticky = true\n\n[[platform.java21.dependency]]\ngroupId = "x"\n`,
    // issue #2817: a key the user (or an earlier disable) set to false must be flipped, not kept.
    "ICP options set to false": `${PACKAGE}\n[build-options]\nobservabilityIncluded = false\nremoteManagement = false\n`,
    "one ICP option already true": `${PACKAGE}\n[build-options]\nobservabilityIncluded = true\n`,
    "ICP options already true": `${PACKAGE}\n[build-options]\nobservabilityIncluded = true\nremoteManagement = true\n`,
    "a key sharing an ICP option's prefix": `${PACKAGE}\n[build-options]\nremoteManagementPort = 9264\n`,
};

function buildOptions(content: string): Record<string, unknown> {
    return (parse(content)["build-options"] ?? {}) as Record<string, unknown>;
}

function withoutBuildOptions(content: string): Record<string, unknown> {
    const { "build-options": _, ...rest } = parse(content);
    return rest;
}

describe.each(Object.entries(MANIFESTS))("ICP build options on a manifest with %s", (_label, manifest) => {
    const userOptions = Object.fromEntries(Object.entries(buildOptions(manifest))
        .filter(([key]) => !ICP_BUILD_OPTION_KEYS.includes(key)));

    it("enables every ICP option and keeps everything else", () => {
        const enabled = addICPBuildOptions(manifest);

        expect(buildOptions(enabled)).toEqual({
            ...userOptions,
            observabilityIncluded: true,
            remoteManagement: true,
        });
        expect(withoutBuildOptions(enabled)).toEqual(withoutBuildOptions(manifest));
        expect(enabled.endsWith("\n")).toBe(true);
    });

    it("is idempotent", () => {
        const once = addICPBuildOptions(manifest);
        expect(addICPBuildOptions(once)).toBe(once);
    });

    it("disables every ICP option and keeps the user's own", () => {
        const disabled = removeICPBuildOptions(addICPBuildOptions(manifest));

        expect(buildOptions(disabled)).toEqual(userOptions);
        expect(withoutBuildOptions(disabled)).toEqual(withoutBuildOptions(manifest));
        if (Object.keys(userOptions).length === 0) {
            expect(disabled).not.toContain("[build-options]");
        }
    });
});

describe("removeICPBuildOptions", () => {
    it("leaves a manifest with no build-options section untouched", () => {
        expect(removeICPBuildOptions(PACKAGE)).toBe(PACKAGE);
    });
});
