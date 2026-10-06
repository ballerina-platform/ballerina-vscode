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
import * as path from "path";
import { parse } from "@iarna/toml";
import {
    AgentManagerConfigField,
    AgentManagerConfigInput,
    ConfigVariable,
    GetRecordConfigResponse,
    getPrimaryInputType,
    TypeField,
} from "@wso2/ballerina-core";
import { StateMachine } from "../../stateMachine";
import { git } from "./github";

const SIMPLE_TYPES = new Set(["string", "int", "float", "decimal", "boolean", "byte"]);
// Agent Manager injects these itself; values in Config.toml would fight its instrumentation.
const PLATFORM_MANAGED = ["ballerinax/amp", "ballerina/observe"];
const SENSITIVE_NAME = /key|secret|token|password/i;
const BARE_KEY = /^[A-Za-z0-9_-]+$/;
const ENV_SAFE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const CONFIG_FILE = { key: "Config.toml", mountPath: "/workspace" };

type ConfigMap = Record<string, Record<string, ConfigVariable[]>>;
type TomlTable = { [key: string]: string | number | boolean | TomlTable };

interface VariableContext {
    projectPath: string;
    section: string[];
    group: string;
    rootModule: boolean;
    ownConfig: boolean;
    envKeys: string[];
    fileSaved: boolean;
}

export function configEnvKey(name: string): string {
    return `BAL_CONFIG_VAR_${name.toUpperCase()}`;
}

export function fieldPath(field: AgentManagerConfigField): string[] {
    return JSON.parse(field.id);
}

export function readPackage(projectPath: string): { org: string; name: string; title?: string } {
    const tomlPath = path.join(projectPath, "Ballerina.toml");
    const toml: any = fs.existsSync(tomlPath) ? parse(fs.readFileSync(tomlPath, "utf-8")) : {};
    return { org: toml.package?.org ?? "", name: toml.package?.name ?? "", title: toml.package?.title };
}

// Prefill only from the user's own Config.toml; one committed to the repo could carry someone else's values.
function isOwnConfig(projectPath: string): boolean {
    const inWorkTree = git(projectPath, ["rev-parse", "--is-inside-work-tree"]).stdout?.trim() === "true";
    // Exit 1 means "not tracked"; anything else (no repo, no git) can't prove the file is the user's own.
    return inWorkTree && git(projectPath, ["ls-files", "--error-unmatch", "Config.toml"]).status === 1;
}

// The language server returns Config.toml values as Ballerina literals; only simple ones are prefilled.
export function literalValue(raw: unknown): string | undefined {
    if (typeof raw !== "string" || !raw || raw.startsWith("{") || raw.startsWith("[")) {
        return undefined;
    }
    if (!raw.startsWith("\"")) {
        return raw;
    }
    try {
        return JSON.parse(raw);
    } catch {
        return raw.slice(1, -1);
    }
}

// Ballerina reads dotted module names as nested tables: [org.pkg.sub], never [org."pkg.sub"].
function sectionFor(pkgKey: string, moduleName: string): string[] {
    const [org, pkg] = pkgKey.split("/");
    const fullModule = !moduleName ? pkg : moduleName === pkg || moduleName.startsWith(`${pkg}.`) ? moduleName : `${pkg}.${moduleName}`;
    return [org, ...fullModule.split(".")];
}

function baseType(type: string): string {
    return type.replace(/\?$/, "").trim();
}

async function recordFields(projectPath: string, variable: ConfigVariable): Promise<TypeField[] | undefined> {
    const typeProp = (variable.properties as any)?.type;
    const member = getPrimaryInputType(typeProp?.types ?? [])?.typeMembers?.find((m) => m.kind === "RECORD_TYPE");
    const [org, module, version] = member?.packageInfo?.split(":") ?? [];
    if (!member || !version) {
        return undefined;
    }
    const balFile = fs.readdirSync(projectPath).find((file) => file.endsWith(".bal"));
    const response: GetRecordConfigResponse = await StateMachine.langClient().getRecordConfig({
        filePath: path.join(projectPath, balFile ?? "main.bal"),
        codedata: { org, module, version, packageName: member.packageName },
        typeConstraint: String(typeProp.value),
    });
    const fields = response.recordConfig?.fields;
    return fields?.every((field) => SIMPLE_TYPES.has(baseType(field.typeName ?? ""))) ? fields : undefined;
}

function field(ctx: VariableContext, keys: string[], label: string, type: string, required: boolean, localValue?: string): AgentManagerConfigField {
    // Names that don't map to a clean env key (quoted or non-ASCII identifiers) go in the file instead.
    const target = ctx.rootModule && keys.length === 1 && ENV_SAFE_NAME.test(keys[0]) ? "env" : "file";
    const fullPath = [...ctx.section, ...keys];
    return {
        id: JSON.stringify(fullPath),
        label,
        group: ctx.group,
        type,
        required,
        secret: SENSITIVE_NAME.test(keys[keys.length - 1]),
        target,
        localValue,
        saved: target === "env" ? ctx.envKeys.includes(configEnvKey(keys[0])) : ctx.fileSaved,
    };
}

async function variableFields(ctx: VariableContext, variable: ConfigVariable): Promise<AgentManagerConfigField[]> {
    const props = variable.properties as any;
    const name = String(props?.variable?.value ?? "");
    const type = baseType(String(props?.type?.value ?? ""));
    const required = !props?.defaultValue?.value;
    if (SIMPLE_TYPES.has(type)) {
        return [field(ctx, [name], name, type, required, ctx.ownConfig ? literalValue(props?.configValue?.value) : undefined)];
    }
    const members = await recordFields(ctx.projectPath, variable).catch((): undefined => undefined);
    if (members) {
        return members.map((member) => field(ctx, [name, member.name!], `${name}.${member.name}`, baseType(member.typeName),
            required && !member.optional && !member.defaultable));
    }
    return [{ ...field(ctx, [name], name, type, required), target: "file", unsupported: "Set this value in the Agent Manager console." }];
}

// Agent Manager fills `configurable x = os:getEnv("NAME")` itself when it injects NAME.
function readsEnv(variable: ConfigVariable, envNames: Set<string>): boolean {
    const name = /^os:getEnv\(\s*"([^"]+)"\s*\)$/.exec(String((variable.properties as any)?.defaultValue?.value ?? "").trim())?.[1];
    return !!name && envNames.has(name);
}

export async function buildConfigFields(projectPath: string, envKeys: string[], fileSaved: boolean, injectedEnv: Set<string>): Promise<AgentManagerConfigField[]> {
    const pkg = readPackage(projectPath);
    const rootKey = `${pkg.org}/${pkg.name}`;
    const response = await StateMachine.langClient().getConfigVariablesV2({ projectPath, includeLibraries: true }) as any;
    const configMap: ConfigMap = response?.configVariables ?? {};
    const ownConfig = isOwnConfig(projectPath);
    const fields: AgentManagerConfigField[] = [];
    for (const [pkgKey, modules] of Object.entries(configMap)) {
        if (PLATFORM_MANAGED.some((managed) => pkgKey === managed || pkgKey.startsWith(`${managed}.`))) {
            continue;
        }
        for (const [moduleName, variables] of Object.entries(modules)) {
            const rootModule = pkgKey === rootKey && !moduleName;
            const group = rootModule ? "" : `${pkgKey}${moduleName ? `/${moduleName}` : ""}`;
            const ctx = { projectPath, section: sectionFor(pkgKey, moduleName), group, rootModule, ownConfig, envKeys, fileSaved };
            for (const variable of variables.filter((v) => !(v.codedata as any)?.data?.isTestConfig && !readsEnv(v, injectedEnv))) {
                const candidates = await variableFields(ctx, variable);
                fields.push(...candidates.filter((f) => pkgKey === rootKey || f.required || f.localValue !== undefined));
            }
        }
    }
    return fields;
}

function coerce(raw: string, type: string): string | number | boolean | undefined {
    if (type === "string") {
        return raw;
    }
    if (type === "boolean") {
        return raw === "true" ? true : raw === "false" ? false : undefined;
    }
    if (type === "int" || type === "byte") {
        return /^-?\d+$/.test(raw) ? Number(raw) : undefined;
    }
    return /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(raw) ? Number(raw) : undefined;
}

function emptyTable(): TomlTable {
    return Object.create(null);
}

// Tables have no prototype and only own keys are followed, so names like "constructor" from a repo stay plain keys.
function setPath(table: TomlTable, keys: string[], value: string | number | boolean): boolean {
    let node = table;
    for (const key of keys.slice(0, -1)) {
        const next = Object.prototype.hasOwnProperty.call(node, key) ? node[key] : (node[key] = emptyTable());
        if (typeof next !== "object") {
            return false;
        }
        node = next;
    }
    const last = keys[keys.length - 1];
    if (Object.prototype.hasOwnProperty.call(node, last)) {
        return false;
    }
    node[last] = value;
    return true;
}

function tomlKey(key: string): string {
    return BARE_KEY.test(key) ? key : JSON.stringify(key);
}

// Ballerina's TOML parser fails on \n and \r escapes, so line breaks go into a multi-line string instead.
function tomlString(value: string): string {
    const escaped = JSON.stringify(value);
    if (!/[\n\r]/.test(value)) {
        return escaped;
    }
    const body = escaped.slice(1, -1).replace(/\\(u[0-9a-fA-F]{4}|.)/g, (match, ch) => (ch === "n" ? "\n" : ch === "r" ? "\r" : match));
    return `"""\n${body}"""`;
}

function tomlValue(value: string | number | boolean, type: string): string {
    if (typeof value === "string") {
        return tomlString(value);
    }
    const isFloat = typeof value === "number" && (type === "float" || type === "decimal") && Number.isInteger(value);
    return isFloat ? `${value}.0` : String(value);
}

// Minimal writer: @iarna/toml quotes dotted keys and groups digits, and Ballerina reads the result differently.
function writeToml(table: TomlTable, types: Map<string, string>, prefix: string[] = []): string {
    const scalars = Object.entries(table).filter(([, value]) => typeof value !== "object");
    const tables = Object.entries(table).filter(([, value]) => typeof value === "object");
    const header = scalars.length > 0 && prefix.length > 0 ? `[${prefix.map(tomlKey).join(".")}]\n` : "";
    const body = scalars.map(([key, value]) => `${tomlKey(key)} = ${tomlValue(value as any, types.get(JSON.stringify([...prefix, key])) ?? "")}\n`).join("");
    const nested = tables.map(([key, value]) => writeToml(value as TomlTable, types, [...prefix, key])).join("");
    return `${header}${body}${header || body ? "\n" : ""}${nested}`;
}

export interface SplitConfig {
    env: { key: string; value: string; isSensitive: boolean }[];
    file?: { value: string; isSensitive: boolean };
    errors: string[];
}

export function splitConfig(fields: AgentManagerConfigField[], input: AgentManagerConfigInput): SplitConfig {
    const result: SplitConfig = { env: [], errors: [] };
    const table = emptyTable();
    const types = new Map<string, string>();
    let fileSecret = false;
    const supported = fields.filter((f) => !f.unsupported);
    for (const f of supported) {
        const raw = String(input.values[f.id] ?? "");
        const secret = input.secrets[f.id] ?? f.secret;
        if (!raw) {
            continue;
        }
        const value = coerce(raw.trim(), f.type);
        if (value === undefined) {
            result.errors.push(`${f.label} must be a ${f.type}.`);
        } else if (f.target === "env") {
            result.env.push({ key: configEnvKey(fieldPath(f)[fieldPath(f).length - 1]), value: raw.trim(), isSensitive: secret });
        } else if (setPath(table, fieldPath(f), value)) {
            types.set(f.id, f.type);
            fileSecret ||= secret;
        } else {
            result.errors.push(`${f.label} clashes with another value of the same name, so it can't go in one Config.toml.`);
        }
    }
    const writesFile = types.size > 0;
    for (const f of supported.filter((candidate) => candidate.required && !input.values[candidate.id])) {
        // Replacing Config.toml drops everything not in the new one, so saved file values count only when the file is kept.
        const kept = f.target === "env" ? f.saved : f.saved && !writesFile;
        if (!kept) {
            result.errors.push(`${f.label} is required.`);
        }
    }
    result.file = writesFile ? { value: writeToml(table, types), isSensitive: fileSecret } : undefined;
    return result;
}
