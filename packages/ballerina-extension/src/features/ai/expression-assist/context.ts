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

import { Range, Uri, workspace } from "vscode";
import { Diagnostic, ExpressionAssistRequest, ExpressionProperty, LineRange, SyntaxTreeResponse, TypeField, redactSecrets } from "@wso2/ballerina-core";
import { StateMachine } from "../../../stateMachine";
import { Enclosing, declaredType, describeDiagnostic, fitTypeDescription, markNode, selectedType, shortTypeNames, unmatchedBracket, withoutCascades } from "./prompts";
import { findPackageRoot } from "../../project/dependency-lock";
import { getProjectTomlValues } from "../../../utils/config";

export type Diagnosed = ReturnType<typeof describeDiagnostic>;

const SCOPE_FIELD_LIMIT = 15;
const FIELD_DEPTH_LIMIT = 3;
const NAMED_TYPE_LIMIT = 4;
const TYPE_DESCRIPTION_LIMIT = 4000;
// Field types the language server's expression check accepts as they are.
const CHECKED_FIELD_TYPES = new Set(["EXPRESSION", "ACTION_OR_EXPRESSION", "LV_EXPRESSION", "SQL_QUERY", "RECORD_MAP_EXPRESSION", "PROMPT", "TYPE", "IDENTIFIER"]);

// Where an expression sits: the file and the field's editor context, whose property sets the expected type.
export type AssistSite = Pick<ExpressionAssistRequest, "filePath" | "context">;

// The language server expands named types, so the model sees a record's fields; the field's own label is the fallback.
export async function describeExpectedType(site: AssistSite): Promise<string> {
    const declared = declaredType(site.context.property);
    return (await describeType(site, undefined)) || (declared === "any" ? "" : declared);
}

// Describes `typeName` at the field's position, or the field's own type when no name is given.
export async function describeType(site: AssistSite, typeName: string | undefined, imports: Record<string, string> = {}, limit = TYPE_DESCRIPTION_LIMIT): Promise<string> {
    const property = typeName
        ? propertyWith(site, imports, [{ fieldType: "EXPRESSION", ballerinaType: typeName, selected: true }])
        : propertyWith(site, {}, site.context.property.types);
    const response = await StateMachine.langClient().getExpectedType({
        filePath: site.filePath,
        context: { ...site.context, expression: "()", property },
    }).catch((): undefined => undefined);
    const described = shortTypeNames(response?.type ?? "", await homeModule(site.filePath));
    const expanded = /^\w+$/.test(described) ? await describeEnum(site, described) : "";
    return fitTypeDescription(expanded || described, limit);
}

// The field's property with more imports and the types the language server should check against.
export function propertyWith(site: AssistSite, imports: Record<string, string>, types: ExpressionProperty["types"]): ExpressionProperty {
    return { ...site.context.property, imports: { ...site.context.property.imports, ...imports, ...typeImports(site) }, types };
}

// The modules the field's own type names (`http:CredentialsConfig`); the language server reads that type only with them imported.
export function typeImports(site: AssistSite): Record<string, string> {
    const types = site.context.property.types ?? [];
    const named = types.map((type) => type.ballerinaType ?? "").join("|");
    return Object.fromEntries(types.flatMap((type) => type.typeMembers ?? []).flatMap(({ packageInfo }) => {
        const [org, module] = packageInfo?.split(":") ?? [];
        const prefix = module?.split(".").pop();
        return org && prefix && new RegExp(`\\b${prefix}:`).test(named) ? [[prefix, `${org}/${module}`]] : [];
    }));
}

// The expected-type request leaves an enum as its bare name; the project's type list has its members.
async function describeEnum(site: AssistSite, name: string): Promise<string> {
    const response = await StateMachine.langClient().getTypes({ filePath: site.filePath }).catch((): undefined => undefined);
    const type = response?.types?.find((known) => known.name === name && known.codedata?.node === "ENUM");
    return type ? `${name} enum {${type.members.map((member) => member.name).join(", ")}}` : "";
}

// The file's own package as `org/name`, whose types read without a module prefix.
async function homeModule(filePath: string): Promise<string> {
    const root = findPackageRoot(filePath);
    const toml = root ? await getProjectTomlValues(root).catch((): undefined => undefined) : undefined;
    return toml?.package ? `${toml.package.org}/${toml.package.name}` : "";
}

export function stripSemicolon(expression: string): string {
    return expression.trim().replace(/;\s*$/, "");
}

export async function checkExpression(site: AssistSite, expression: string, imports: Record<string, string>): Promise<string[]> {
    return (await diagnoseExpression(site, expression, imports)).map(({ error }) => error);
}

// The compiler errors of `expression` at the field's position, each with the fix for its code when one is known.
export async function diagnoseExpression(site: AssistSite, expression: string, imports: Record<string, string>): Promise<Diagnosed[]> {
    const unmatched = unmatchedBracket(expression);
    if (unmatched) {
        return [{ error: unmatched }];
    }
    // Text and template fields end up holding an expression, which the language server checks as one.
    const property = propertyWith(site, imports,
        site.context.property.types.map((type) => CHECKED_FIELD_TYPES.has(type.fieldType) ? type : { ...type, fieldType: "EXPRESSION" as const }));
    const response = await StateMachine.langClient().checkExpression({
        filePath: site.filePath,
        context: { ...site.context, expression, property },
    });
    const home = await homeModule(site.filePath);
    const described = (response?.diagnostics ?? []).map((diagnostic) => describeDiagnostic({
        message: shortTypeNames(diagnostic.message, home),
        code: codeOf(diagnostic.code),
        range: inExpression(diagnostic, site.context.startLine, property, expression),
    }, expression));
    const kept = withoutCascades([...new Set(described.map(({ error }) => error))]);
    return kept.map((error) => described.find((known) => known.error === error)!);
}

const codeOf = (code: unknown): string => String((code as { left?: string })?.left ?? code ?? "");

// shortcut: semantic errors land on the server's probe `T __reserved__ = <expression>;`, mapped back only for a one-line value whose type names no module; move to the server if the probe changes.
function inExpression(diagnostic: Diagnostic, at: { line: number; offset: number }, property: ExpressionProperty, expression: string): Diagnostic["range"] | undefined {
    if (codeOf(diagnostic.code).startsWith("BCE0")) {
        return diagnostic.range;
    }
    const type = selectedType(property)?.ballerinaType?.trim() || "any|error";
    const shift = at.offset + `${type} __reserved__ = `.length;
    const { start, end } = diagnostic.range;
    const inside = start.line === at.line && end.line === at.line && start.character >= shift && end.character <= shift + expression.length;
    return inside && !type.includes(":") && !expression.includes("\n")
        ? { start: { line: 0, character: start.character - shift }, end: { line: 0, character: end.character - shift } }
        : undefined;
}

// The function or resource holding the node, e.g. `function requestRefund(RefundRequest request) returns RefundResult|error`.
export async function describeEnclosing(site: AssistSite): Promise<Enclosing> {
    const client = StateMachine.langClient();
    const range = await client.getEnclosedFunctionDef({ filePath: site.filePath, position: site.context.startLine })
        .catch((): undefined => undefined);
    if (!range?.startLine || !range?.endLine) {
        return { signature: "", code: "" };
    }
    // The enclosing function's lines, read from the editor's copy, with the field's node marked and secrets left out.
    const code = await Promise.resolve(workspace.openTextDocument(Uri.file(site.filePath)))
        .then((document) => redactSecrets(markNode(document.getText(new Range(range.startLine.line, 0, range.endLine.line + 1, 0)), range.startLine.line, site.context.startLine)))
        .catch(() => "");
    const tree = await client.getSTByRange({
        documentIdentifier: { uri: Uri.file(site.filePath).toString() },
        lineRange: {
            start: { line: range.startLine.line, character: range.startLine.offset },
            end: { line: range.endLine.line, character: range.endLine.offset },
        },
    }).catch((): undefined => undefined) as SyntaxTreeResponse | undefined;
    const node = tree?.syntaxTree as any;
    if (!node?.functionName?.value || !node.functionSignature?.source) {
        return { signature: "", code };
    }
    const path = (node.relativeResourcePath ?? []).map((segment: any) => segment.source ?? segment.value).join("");
    return { signature: `function ${node.functionName.value} ${path}${node.functionSignature.source}`.replace(/\s+/g, " ").trim(), code };
}

// shortcut: a service's code is cut at this many lines; read its parts on demand if long services lose answers.
const SUBJECT_LINES = 200;

// The code of what a form edits, e.g. a whole service with its resources.
export async function subjectCode(site: AssistSite, range: LineRange): Promise<string> {
    const document = await workspace.openTextDocument(Uri.file(site.filePath));
    const last = Math.min(range.endLine.line, range.startLine.line + SUBJECT_LINES - 1);
    const code = redactSecrets(document.getText(new Range(range.startLine.line, 0, last + 1, 0)));
    return last < range.endLine.line ? `${code}… (${range.endLine.line - last} more lines)` : code;
}

export async function describeScope(site: AssistSite): Promise<string> {
    const response = await StateMachine.langClient()
        .getVisibleVariableTypes({ filePath: site.filePath, position: site.context.startLine })
        .catch((): undefined => undefined);
    if (!response || !("categories" in response)) {
        return "";
    }
    const variables = response.categories.flatMap((category) => category.types.map((variable) => ({ ...variable, category: category.name })));
    const lines = variables.map(({ name, type, category }) =>
        `- ${name}: ${typeLabel(type)} (${category.toLowerCase()})${recordFields(type)}`);
    // Named records arrive without their fields; the language server describes them, nested records included.
    const named = [...new Set(variables.filter(({ type }) => type.typeName === "record" && !type.fields?.length)
        .map(({ type }) => typeLabel(type)))].slice(0, NAMED_TYPE_LIMIT);
    const definitions: string[] = [];
    for (const name of named) {
        const described = await describeType(site, name);
        if (described && !definitions.some((known) => known.includes(`${name} record`))) {
            definitions.push(described);
        }
    }
    return definitions.length ? `${lines.join("\n")}\nRecord types:\n${definitions.join("\n")}` : lines.join("\n");
}

function typeLabel(type: TypeField): string {
    return type.name || type.typeName || "any";
}

// Nested record fields, so the model can reach ord.customer.vip without a lookup; depth and size are capped.
function recordFields(type: TypeField, depth = 0): string {
    const fields = type.fields ?? [];
    if (fields.length === 0 || depth >= FIELD_DEPTH_LIMIT) {
        return "";
    }
    const shown = fields.slice(0, SCOPE_FIELD_LIMIT)
        .map((field) => `${field.name}${field.optional ? "?" : ""}: ${typeLabel(field)}${recordFields(field, depth + 1)}`);
    const more = fields.length > SCOPE_FIELD_LIMIT ? `, … ${fields.length - SCOPE_FIELD_LIMIT} more` : "";
    return ` {${shown.join(", ")}${more}}`;
}
