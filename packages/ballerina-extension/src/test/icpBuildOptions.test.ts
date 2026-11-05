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
// option is left and the user's own options survive. Enable is idempotent, keeps every comment,
// and disable undoes an enable on a manifest that had no ICP options to begin with.
// `hasICPBuildOptions` agrees with both: true after enabling, false after disabling.

import { parse } from "@iarna/toml";
import {
    addICPBuildOptions,
    hasICPBuildOptions,
    ICP_BUILD_OPTION_KEYS,
    removeICPBuildOptions,
} from "../rpc-managers/icp-service/build-options";

const PACKAGE = `[package]
org = "acme"
name = "orders"
version = "0.1.0"
distribution = "2201.13.0"
`;

const LF_MANIFESTS: Record<string, string> = {
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
    "quoted ICP options": `${PACKAGE}\n[build-options]\n"remoteManagement" = false\n'observabilityIncluded' = false\n`,
    "a build-options header with a trailing comment": `${PACKAGE}\n[build-options] # ICP settings\nsticky = true\n`,
    "a quoted, spaced build-options header": `${PACKAGE}\n[ "build-options" ]\nsticky = true\n`,
    "ICP options with trailing comments": `${PACKAGE}\n[build-options]\nobservabilityIncluded = false # traces\nremoteManagement=false   # keep\n`,
    "a commented table after build-options with its own remoteManagement": `${PACKAGE}\n[build-options]\nsticky = true\n\n[other] # settings\nremoteManagement = false\n`,
};

// Every manifest again with CRLF line endings, as a manifest saved on Windows has.
const MANIFESTS: Record<string, string> = {
    ...LF_MANIFESTS,
    ...Object.fromEntries(Object.entries(LF_MANIFESTS)
        .map(([label, manifest]) => [`${label} (CRLF)`, manifest.replace(/\n/g, "\r\n")])),
};

// True when every line break in the content is the one the manifest uses.
function keepsLineEndings(manifest: string, content: string): boolean {
    return manifest.includes("\r\n") ? !/(^|[^\r])\n/.test(content) : !content.includes("\r");
}

function comments(content: string): string[] {
    return content.match(/#.*$/gm) ?? [];
}

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
        expect(keepsLineEndings(manifest, enabled)).toBe(true);
    });

    it("keeps every comment when enabling", () => {
        const enabled = addICPBuildOptions(manifest);
        for (const comment of comments(manifest)) {
            expect(enabled).toContain(comment);
        }
    });

    it("reports ICP as enabled after enabling and not after disabling", () => {
        const enabled = addICPBuildOptions(manifest);
        expect(hasICPBuildOptions(enabled)).toBe(true);
        expect(hasICPBuildOptions(removeICPBuildOptions(enabled))).toBe(false);
    });

    it("is idempotent", () => {
        const once = addICPBuildOptions(manifest);
        expect(addICPBuildOptions(once)).toBe(once);
    });

    it("disables every ICP option and keeps the user's own", () => {
        const disabled = removeICPBuildOptions(addICPBuildOptions(manifest));

        expect(buildOptions(disabled)).toEqual(userOptions);
        expect(withoutBuildOptions(disabled)).toEqual(withoutBuildOptions(manifest));
        expect(keepsLineEndings(manifest, disabled)).toBe(true);
        if (Object.keys(userOptions).length === 0) {
            expect(disabled).not.toContain("[build-options]");
        }
    });
});

describe("hasICPBuildOptions", () => {
    it("is false while any ICP option is missing or not true", () => {
        expect(hasICPBuildOptions(PACKAGE)).toBe(false);
        expect(hasICPBuildOptions(MANIFESTS["one ICP option already true"])).toBe(false);
        expect(hasICPBuildOptions(MANIFESTS["ICP options set to false"])).toBe(false);
        expect(hasICPBuildOptions(`${PACKAGE}\n[other]\nobservabilityIncluded = true\nremoteManagement = true\n`)).toBe(false);
    });
});

describe("addICPBuildOptions", () => {
    // A second [build-options] table next to an inline one is a duplicate-table error.
    it.each([
        ["an inline table", `build-options = { sticky = true }\n${PACKAGE}`],
        ["a dotted key", `build-options.sticky = true\n${PACKAGE}`],
    ])("refuses build options set with %s", (_label, manifest) => {
        expect(() => addICPBuildOptions(manifest)).toThrow(/inline/);
    });
});

describe("removeICPBuildOptions", () => {
    it("leaves a manifest with no build-options section untouched", () => {
        expect(removeICPBuildOptions(PACKAGE)).toBe(PACKAGE);
    });
});
