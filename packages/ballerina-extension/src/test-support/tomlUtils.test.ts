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

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parse } from "@iarna/toml";

import {
    ConfigVariable,
    getAllConfigStatus,
    readExistingConfigValues,
    writeConfigValuesToConfig,
} from "../utils/toml-utils";

const ORG = "myorg";
const PKG = "mypkg";

let configPath: string;

beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "toml-utils-"));
    configPath = path.join(dir, "Config.toml");
});

afterEach(() => {
    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
});

function readSection(): Record<string, unknown> {
    const parsed = parse(fs.readFileSync(configPath, "utf-8")) as Record<string, any>;
    return parsed[ORG][PKG];
}

describe("writeConfigValuesToConfig — numeric repair covers the whole section", () => {
    const variables: ConfigVariable[] = [
        { name: "tiny", description: "", type: "float" },
        { name: "port", description: "", type: "int" },
        { name: "other", description: "", type: "string" },
    ];

    it("REGRESSION: a numeric key already on disk survives a write that doesn't resubmit it", () => {
        writeConfigValuesToConfig(configPath, { tiny: "1e-7", port: "8080" }, variables, ORG, PKG);

        // Second write only resubmits an unrelated key — tiny/port are not in `configValues`.
        writeConfigValuesToConfig(configPath, { other: "5" }, variables, ORG, PKG);

        const raw = fs.readFileSync(configPath, "utf-8");
        // Must still be parseable — a corrupted token like "1e-7.0" is invalid TOML.
        expect(() => parse(raw)).not.toThrow();

        const section = readSection();
        expect(section.tiny).toBe(1e-7);
        expect(section.port).toBe(8080);
        expect(section.other).toBe("5");
        // No underscore digit-grouping in the written text — Ballerina rejects it.
        expect(raw).not.toMatch(/\d_\d/);
    });

    it("keeps a numeric array already on disk intact across an unrelated write", () => {
        const arrVars: ConfigVariable[] = [
            { name: "ports", description: "", type: "int[]" },
            { name: "other", description: "", type: "string" },
        ];
        writeConfigValuesToConfig(configPath, { ports: "8080, 9090" }, arrVars, ORG, PKG);
        writeConfigValuesToConfig(configPath, { other: "5" }, arrVars, ORG, PKG);

        const section = readSection();
        expect(section.ports).toEqual([8080, 9090]);
    });
});

describe("writeConfigValuesToConfig — integral float/decimal values", () => {
    it("keeps a decimal point on a whole-number float scalar", () => {
        const variables: ConfigVariable[] = [{ name: "rate", description: "", type: "float" }];
        writeConfigValuesToConfig(configPath, { rate: "1.0" }, variables, ORG, PKG);

        const raw = fs.readFileSync(configPath, "utf-8");
        expect(raw).toMatch(/rate\s*=\s*1\.0/);
        expect(parse(raw) as any).toBeDefined();
    });

    it("keeps a decimal point on whole-number decimal array elements", () => {
        const variables: ConfigVariable[] = [{ name: "rates", description: "", type: "decimal[]" }];
        writeConfigValuesToConfig(configPath, { rates: "1.0, 2.5, 3.0" }, variables, ORG, PKG);

        const raw = fs.readFileSync(configPath, "utf-8");
        expect(raw).toMatch(/rates\s*=\s*\[\s*1\.0,\s*2\.5,\s*3\.0\s*\]/);
    });

    it("does not add a decimal point to plain int values", () => {
        const variables: ConfigVariable[] = [{ name: "port", description: "", type: "int" }];
        writeConfigValuesToConfig(configPath, { port: "8080" }, variables, ORG, PKG);

        const raw = fs.readFileSync(configPath, "utf-8");
        expect(raw).toMatch(/port\s*=\s*8080\s*$/m);
    });
});

describe("writeConfigValuesToConfig — byte range", () => {
    it("accepts a byte value within 0-255", () => {
        const variables: ConfigVariable[] = [{ name: "flags", description: "", type: "byte" }];
        writeConfigValuesToConfig(configPath, { flags: "255" }, variables, ORG, PKG);

        expect(readSection().flags).toBe(255);
    });

    it("rejects a byte scalar value outside 0-255", () => {
        const variables: ConfigVariable[] = [{ name: "flags", description: "", type: "byte" }];
        expect(() =>
            writeConfigValuesToConfig(configPath, { flags: "256" }, variables, ORG, PKG)
        ).toThrow(/byte value/i);
    });

    it("rejects a byte array element outside 0-255", () => {
        const variables: ConfigVariable[] = [{ name: "flags", description: "", type: "byte[]" }];
        expect(() =>
            writeConfigValuesToConfig(configPath, { flags: "10, 300" }, variables, ORG, PKG)
        ).toThrow(/byte value/i);
    });

    it("does not restrict plain int values to the byte range", () => {
        const variables: ConfigVariable[] = [{ name: "port", description: "", type: "int" }];
        writeConfigValuesToConfig(configPath, { port: "8080" }, variables, ORG, PKG);

        expect(readSection().port).toBe(8080);
    });
});

describe("writeConfigValuesToConfig — malformed decimal tokens", () => {
    it("rejects a numeric-prefixed non-numeric scalar (parseFloat would silently truncate it)", () => {
        const variables: ConfigVariable[] = [{ name: "timeout", description: "", type: "float" }];
        expect(() =>
            writeConfigValuesToConfig(configPath, { timeout: "12ms" }, variables, ORG, PKG)
        ).toThrow(/invalid decimal value/i);
    });

    it("rejects a numeric-prefixed non-numeric array element", () => {
        const variables: ConfigVariable[] = [{ name: "timeouts", description: "", type: "decimal[]" }];
        expect(() =>
            writeConfigValuesToConfig(configPath, { timeouts: "1.5, 12ms" }, variables, ORG, PKG)
        ).toThrow(/invalid decimal value/i);
    });

    it("still accepts valid exponent-notation decimals", () => {
        const variables: ConfigVariable[] = [{ name: "tiny", description: "", type: "float" }];
        writeConfigValuesToConfig(configPath, { tiny: "1e-7" }, variables, ORG, PKG);

        expect(readSection().tiny).toBe(1e-7);
    });
});

describe("readExistingConfigValues — boolean values", () => {
    it("returns 'false' for a configurable boolean explicitly set to false", () => {
        const variables: ConfigVariable[] = [{ name: "flag", description: "", type: "boolean" }];
        writeConfigValuesToConfig(configPath, { flag: "false" }, variables, ORG, PKG);

        const existing = readExistingConfigValues(configPath, ["flag"], ORG, PKG);
        expect(existing.flag).toBe("false");
    });

    it("returns 'true' for a configurable boolean set to true", () => {
        const variables: ConfigVariable[] = [{ name: "flag", description: "", type: "boolean" }];
        writeConfigValuesToConfig(configPath, { flag: "true" }, variables, ORG, PKG);

        const existing = readExistingConfigValues(configPath, ["flag"], ORG, PKG);
        expect(existing.flag).toBe("true");
    });
});

describe("getAllConfigStatus — agrees with readExistingConfigValues for booleans", () => {
    it("reports a false boolean as filled, not missing", () => {
        const variables: ConfigVariable[] = [{ name: "flag", description: "", type: "boolean" }];
        writeConfigValuesToConfig(configPath, { flag: "false" }, variables, ORG, PKG);

        const status = getAllConfigStatus(configPath, ORG, PKG);
        expect(status.flag).toBe("filled");
    });
});
