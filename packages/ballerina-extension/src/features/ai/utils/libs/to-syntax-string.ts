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

import {
    Library,
    TypeDefinition,
    TypeDefinitionBase,
    RecordTypeDefinition,
    EnumTypeDefinition,
    UnionTypeDefinition,
    ConstantTypeDefinition,
    ClassTypeDefinition,
    Client,
    RemoteFunction,
    ResourceFunction,
    Field,
    Type,
    Link,
    Parameter,
    GenericService,
    FixedService,
    Service,
    ParameterDef,
    PathParameter,
    Annotation,
    AnnotationAttachment,
    ServiceAnnotationRef,
    ServiceRemoteFunction,
    ServiceIdentifier,
    ServiceConstraint,
    ConstraintSubject,
    AnnotationRequirement,
    BindingShape,
    TypedescVariant,
    PlatformDependency,
} from "./library-types";

/**
 * One `AnnotationAttachPoint` constant, as it must be written in a Ballerina annotation declaration.
 *
 * Two facts are needed per point, not one: a *source-only* point takes the `source` qualifier in the `on`
 * clause **and** obliges the declaration itself to be `const`. The compiler rejects the non-const form
 * outright ("annotation declaration with 'source' attach point(s) should be a 'const' declaration").
 */
interface AttachmentPoint {
    /** The token written after `on` (after `on source` for a source-only point). */
    token: string;
    /** Whether the point obliges `public const annotation ... on source <token>;`. */
    sourceOnly?: boolean;
}

/**
 * The compiler's `AnnotationAttachPoint` constants mapped to the syntax that actually compiles.
 *
 * **Every entry here was verified by compiling it** (Ballerina 2201.13.4). Three tokens are easy to get
 * wrong, and did ship wrong:
 *
 *  - `OBJECT_METHOD` is Ballerina's `object function`, not `service_function`.
 *  - `RESOURCE` is Ballerina's `service remote function`; there is no `resource function` attach point.
 *  - `OBJECT` has no bare `object` attach point, so the constant is **deliberately absent** from this map:
 *    `renderAnnotation` then returns null and the caller drops the entry. Omitting a declaration beats
 *    emitting one a model may copy and cannot compile.
 *
 * The six source-only points carry the `sourceOnly` flag rather than being dropped, because the const form
 * is legal with a type constraint (`public const annotation Cfg A1 on source listener;` compiles) and so
 * loses no information.
 *
 * `COMPILER_VERIFIED_ATTACH_POINTS` in the test suite pins every entry to a form that was actually built.
 */
const ATTACHMENT_POINT_LABELS: Record<string, AttachmentPoint> = {
    // Curated service-index points.
    SERVICE: { token: "service" },
    OBJECT_METHOD: { token: "object function" },
    // Points supplemented from the Semantic Model, mapped to their Ballerina `on`-clause tokens.
    TYPE: { token: "type" },
    FUNCTION: { token: "function" },
    RESOURCE: { token: "service remote function" },
    PARAMETER: { token: "parameter" },
    RETURN: { token: "return" },
    CLASS: { token: "class" },
    FIELD: { token: "field" },
    OBJECT_FIELD: { token: "object field" },
    RECORD_FIELD: { token: "record field" },
    // Source-only points: `public const annotation N on source <token>;`.
    LISTENER: { token: "listener", sourceOnly: true },
    ANNOTATION: { token: "annotation", sourceOnly: true },
    EXTERNAL: { token: "external", sourceOnly: true },
    VAR: { token: "var", sourceOnly: true },
    CONST: { token: "const", sourceOnly: true },
    WORKER: { token: "worker", sourceOnly: true },
};

/**
 * Derives a module prefix from a library name.
 * Rule: split on `/` and `.`, take the last segment.
 * e.g., "ballerina/http" -> "http", "ballerinax/docusign.dsesign" -> "dsesign"
 */
export function deriveModulePrefix(libraryName: string): string {
    const parts = libraryName.split(/[/.]/);
    return parts[parts.length - 1];
}

/**
 * CamelCase join of a dotted module's segments, used as a fallback prefix when the natural one is already
 * taken. e.g. "ballerinax/googleapis.drive" -> "googleapisDrive".
 */
function deriveCamelCasePrefix(libraryName: string): string {
    const moduleName = libraryName.slice(libraryName.indexOf("/") + 1);
    const segments = moduleName.split(".").filter(Boolean);
    if (segments.length < 2) {
        return deriveModulePrefix(libraryName);
    }
    return segments[0] + segments.slice(1)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join("");
}

/**
 * Gives every distinct library its own prefix.
 *
 * Ballerina derives an unaliased import's prefix from the module name's last dot-segment, so two libraries
 * whose names end in the same segment - "ballerinax/googleapis.drive" and "x/ai.google.drive" - both derive
 * `drive`. Rendering both records as `drive:Name` names one module twice and would not compile. Distinct
 * libraries therefore fall back to the camelCase alias and then to a numbered suffix, matching what the
 * language server emits for a colliding import.
 *
 * A library keeps its natural prefix whenever nothing else has claimed it, so single-library output is
 * unchanged.
 */
function assignModulePrefixes(links: { recordName: string; libraryName: string }[]): ExternalLinkInfo[] {
    const prefixByLibrary = new Map<string, string>();
    const taken = new Set<string>();
    for (const { libraryName } of links) {
        if (prefixByLibrary.has(libraryName)) {
            continue;
        }
        let prefix = deriveModulePrefix(libraryName);
        if (taken.has(prefix)) {
            const camelCase = deriveCamelCasePrefix(libraryName);
            prefix = camelCase;
            let suffix = 2;
            while (taken.has(prefix)) {
                prefix = `${camelCase}${suffix++}`;
            }
        }
        taken.add(prefix);
        prefixByLibrary.set(libraryName, prefix);
    }
    return links.map((link) => ({ ...link, modulePrefix: prefixByLibrary.get(link.libraryName)! }));
}

interface ExternalLinkInfo {
    recordName: string;
    libraryName: string;
    modulePrefix: string;
}

/**
 * Collects external link info from a Type's links array.
 */
function collectExternalLinks(type: Type): ExternalLinkInfo[] {
    if (!type.links) {
        return [];
    }
    return assignModulePrefixes(
        type.links
            .filter((link): link is Link & { libraryName: string } =>
                link.category === "external" && !!link.libraryName
            )
            .map((link) => ({ recordName: link.recordName, libraryName: link.libraryName }))
    );
}

/**
 * Applies module prefix to type name for each external link using word-boundary-aware replacement.
 */
function applyPrefixToTypeName(typeName: string, externalLinks: ExternalLinkInfo[]): string {
    let result = typeName;
    for (const link of externalLinks) {
        const regex = new RegExp(`\\b${escapeRegExp(link.recordName)}\\b`, "g");
        result = result.replace(regex, `${link.modulePrefix}:${link.recordName}`);
    }
    return result;
}

function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A type name as it must be written in the *user's* module.
 *
 * Three cases, told apart by the links the pipeline attached rather than by inspecting the name:
 *  - an **external** link means the type belongs to another package, so it takes that package's prefix —
 *    the same rule every other cross-module reference in this file follows;
 *  - an **internal** link means the library stripped its own prefix off on the way out, so the listener's
 *    alias goes back on: `Session` was `mcp:Session`, and a service body written by the reader needs it;
 *  - **no link at all** is either a builtin (`anydata`, `string|int`) or a name that already carries a
 *    foreign prefix (`http:Headers`), and neither takes an alias.
 *
 * Deduplicated by record name, so a union naming the same type twice cannot be prefixed twice.
 */
function qualifyDeclaredType(type: Type | undefined, listenerAlias: string | null): string {
    if (!type) {
        return "";
    }
    const externalLinks = collectExternalLinks(type);
    if (externalLinks.length > 0) {
        return applyPrefixToTypeName(type.name, externalLinks);
    }
    if (!listenerAlias) {
        return type.name;
    }
    const internalNames = new Set(
        (type.links ?? []).filter((link) => link.category === "internal").map((link) => link.recordName)
    );
    let result = type.name;
    for (const recordName of internalNames) {
        // Lookarounds rather than `\b…\b`. A record name can end in `]` — `AnydataConsumerRecord[]` is what
        // the pipeline strips the alias off for kafka's payload slot — and `\b` after `]` demands a word
        // character that is not there at end of string, so the name silently stayed bare and uncompilable.
        // The leading `(?<![\w:])` additionally refuses to match inside an already-qualified name.
        const regex = new RegExp(`(?<![\\w:])${escapeRegExp(recordName)}(?!\\w)`, "g");
        result = result.replace(regex, `${listenerAlias}:${recordName}`);
    }
    return result;
}

/**
 * How a note refers to a parameter slot.
 *
 * A repeatable slot (spec §7 `addMode: "many"`) usually has no name — the document leaves each occurrence's
 * name to the author — so a note built from `param.name` would read "`undefined` may also be: …". Every
 * note that names a slot goes through here so that cannot happen.
 */
function paramLabel(param: ParameterDef): string {
    if (param.name) {
        return `\`${param.name}\``;
    }
    return param.repeatable ? "each repeated parameter" : "this parameter";
}

/**
 * Builds the "// Special Agent Note: ..." comment for external links.
 * Groups record names by library name.
 */
function buildSpecialAgentNote(externalLinks: ExternalLinkInfo[]): string {
    if (externalLinks.length === 0) {
        return "";
    }

    const grouped = new Map<string, string[]>();
    for (const link of externalLinks) {
        if (!grouped.has(link.libraryName)) {
            grouped.set(link.libraryName, []);
        }
        grouped.get(link.libraryName)!.push(link.recordName);
    }

    const parts: string[] = [];
    for (const [libName, recordNames] of grouped) {
        parts.push(`${recordNames.join(", ")} FROM ${libName} package`);
    }

    return ` // Special Agent Note: ${parts.join(", ")}`;
}

/**
 * Renders a single annotation attachment as `@[prefix:]Name [value]`.
 * The module prefix is derived from the attachment's `module` (e.g. "ballerina/http" -> "http");
 * when absent, the annotation belongs to the current library and is rendered bare.
 */
function renderAttachmentName(annotation: AnnotationAttachment): string {
    const prefix = annotation.module ? deriveModulePrefix(annotation.module) : "";
    const qualifiedName = prefix ? `${prefix}:${annotation.name}` : annotation.name;
    return annotation.value ? `@${qualifiedName} ${annotation.value}` : `@${qualifiedName}`;
}

/**
 * Renders annotation attachments as one line each, prefixed with `indent`.
 */
function renderAttachmentLines(annotations: AnnotationAttachment[] | undefined, indent: string): string[] {
    if (!annotations || annotations.length === 0) {
        return [];
    }
    return annotations.map((annotation) => `${indent}${renderAttachmentName(annotation)}`);
}

/**
 * Renders annotation attachments as a block (lines + trailing newline) for string-concatenation
 * renderers. Returns "" when there are none.
 */
function renderAttachmentBlock(annotations: AnnotationAttachment[] | undefined, indent: string): string {
    const lines = renderAttachmentLines(annotations, indent);
    return lines.length > 0 ? lines.join("\n") + "\n" : "";
}

/**
 * Renders annotation attachments inline (space-separated, trailing space) for a parameter
 * declaration. Returns "" when there are none.
 */
function renderInlineAttachments(annotations: AnnotationAttachment[] | undefined): string {
    if (!annotations || annotations.length === 0) {
        return "";
    }
    return annotations.map(renderAttachmentName).join(" ") + " ";
}

/**
 * Renders a description as `#` comment lines.
 */
function renderDescription(description: string | undefined): string {
    if (!description || description.trim() === "") {
        return "";
    }
    return description
        .split("\n")
        .map((line) => `# ${line}`)
        .join("\n") + "\n";
}

/**
 * Renders a record type definition to Ballerina syntax.
 */
function renderRecord(typeDef: RecordTypeDefinition): string {
    const lines: string[] = [];
    lines.push(renderDescription(typeDef.description));
    if (typeDef.isDeprecated) {
        lines.push("@deprecated");
    }
    lines.push(...renderAttachmentLines(typeDef.annotations, ""));
    lines.push(`type ${typeDef.name} record {`);

    for (const field of typeDef.fields) {
        const externalLinks = collectExternalLinks(field.type);
        const typeName = applyPrefixToTypeName(field.type.name, externalLinks);
        const optional = field.optional ? "?" : "";
        const defaultVal = field.default !== undefined ? ` = ${field.default}` : "";
        const fieldDesc = field.description ? `    # ${field.description}\n` : "";
        const fieldDeprecated = field.isDeprecated ? "    @deprecated\n" : "";
        const fieldAnnotations = renderAttachmentBlock(field.annotations, "    ");
        const agentNote = buildSpecialAgentNote(externalLinks);
        lines.push(`${fieldDesc}${fieldDeprecated}${fieldAnnotations}    ${typeName} ${field.name}${optional}${defaultVal};${agentNote}`);
    }

    lines.push("};");
    return lines.join("\n");
}

function renderDeprecation(isDeprecated: boolean | undefined): string {
    return isDeprecated ? "@deprecated\n" : "";
}

/**
 * Renders an enum type definition to Ballerina syntax.
 */
function renderEnum(typeDef: EnumTypeDefinition): string {
    const lines: string[] = [];
    lines.push(renderDescription(typeDef.description));
    if (typeDef.isDeprecated) {
        lines.push("@deprecated\n");
    }
    lines.push(renderAttachmentBlock(typeDef.annotations, ""));
    const members = typeDef.members.map((m) => m.name).join(",\n    ");
    lines.push(`enum ${typeDef.name} {\n    ${members}\n}`);
    return lines.join("");
}

/**
 * Renders a union type definition to Ballerina syntax.
 */
function renderUnion(typeDef: UnionTypeDefinition): string {
    const desc = renderDescription(typeDef.description);
    const dep = renderDeprecation(typeDef.isDeprecated);
    const ann = renderAttachmentBlock(typeDef.annotations, "");
    if (!typeDef.members || typeDef.members.length === 0) {
        return `${desc}${dep}${ann}type ${typeDef.name};`;
    }
    const members = typeDef.members.map((m) => m.name).join("|");
    return `${desc}${dep}${ann}type ${typeDef.name} ${members};`;
}

/**
 * Renders a constant type definition to Ballerina syntax.
 */
function renderConstant(typeDef: ConstantTypeDefinition): string {
    const desc = renderDescription(typeDef.description);
    const dep = renderDeprecation(typeDef.isDeprecated);
    const ann = renderAttachmentBlock(typeDef.annotations, "");
    const value = typeDef.varType.name === "string" ? `"${typeDef.value}"` : typeDef.value;
    return `${desc}${dep}${ann}const ${typeDef.varType.name} ${typeDef.name} = ${value};`;
}

/**
 * Renders a class or object type definition to Ballerina syntax, including its methods.
 *
 * Covers both `public class C { ... }` and `public type C object { ... }`; the latter renders as
 * `client class` when it carries the `client` qualifier (e.g. `sql:Client`), matching how a client
 * class declaration is rendered. A definition with no members still renders as an empty body, which
 * is correct for marker types such as `kafka:Service`.
 */
function renderClass(typeDef: ClassTypeDefinition): string {
    const desc = renderDescription(typeDef.description);
    const dep = renderDeprecation(typeDef.isDeprecated);
    const ann = renderAttachmentBlock(typeDef.annotations, "");
    const keyword = typeDef.isClient ? "client class" : "class";
    const functions = typeDef.functions ?? [];

    if (functions.length === 0) {
        return `${desc}${dep}${ann}${keyword} ${typeDef.name} {\n}`;
    }

    const lines: string[] = [`${desc}${dep}${ann}${keyword} ${typeDef.name} {`];
    for (const func of functions) {
        lines.push(...renderClassMember(func));
    }
    lines.push("}");
    return lines.join("\n");
}

/**
 * Renders a type definition that carries no members — an error type, or any shape the extractor
 * does not decompose (tuple, map, table, stream, intersection). `baseType` is the compiler's own
 * signature for the type, already stripped of org/version prefixes, so it is emitted verbatim as
 * the declaration's right-hand side.
 *
 * Note the rendered form omits `distinct`: the compiler reports `error` for a
 * `distinct error` declaration, and the qualifier cannot be recovered from the signature.
 */
function renderBaseTypeDefinition(typeDef: TypeDefinitionBase): string {
    if (!typeDef.baseType) {
        // Nothing to describe the shape with — keep the previous output rather than emit a
        // declaration with an empty right-hand side.
        return `// Unknown type: ${typeDef.name}`;
    }
    const desc = renderDescription(typeDef.description);
    const dep = renderDeprecation(typeDef.isDeprecated);
    const ann = renderAttachmentBlock(typeDef.annotations, "");
    return `${desc}${dep}${ann}type ${typeDef.name} ${typeDef.baseType};`;
}

/**
 * Renders a type definition to Ballerina syntax.
 */
function renderTypeDef(typeDef: TypeDefinition): string {
    switch (typeDef.type) {
        case "Record":
            return renderRecord(typeDef as RecordTypeDefinition);
        case "Enum":
            return renderEnum(typeDef as EnumTypeDefinition);
        case "Union":
            return renderUnion(typeDef as UnionTypeDefinition);
        case "Constant":
            return renderConstant(typeDef as ConstantTypeDefinition);
        case "Class":
            return renderClass(typeDef as ClassTypeDefinition);
        case "Error":
        case "Other":
            return renderBaseTypeDefinition(typeDef as TypeDefinitionBase);
        default:
            return `// Unknown type: ${typeDef.name}`;
    }
}

/**
 * Collects all external links from parameters and return type.
 */
function collectFunctionExternalLinks(params: Parameter[], returnType?: Type): ExternalLinkInfo[] {
    const links: ExternalLinkInfo[] = [];
    for (const param of params) {
        links.push(...collectExternalLinks(param.type));
    }
    if (returnType) {
        links.push(...collectExternalLinks(returnType));
    }
    // Deduplicate by recordName + libraryName
    const seen = new Set<string>();
    const distinct = links.filter((l) => {
        const key = `${l.recordName}::${l.libraryName}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
    // Reassign across the merged set: the per-type passes above cannot see each other, so two libraries
    // sharing a natural prefix would each have kept it.
    return assignModulePrefixes(distinct);
}

/**
 * Renders a parameter (for functions).
 *
 * `externalLinks` must be the whole signature's, from {@link collectFunctionExternalLinks}. Collecting them
 * per parameter gives each one its own empty `taken` set, so two libraries whose names end in the same segment
 * would both keep that segment — and the return type, which does use the merged set, would then disagree with
 * the parameters about which module the one qualifier stands for.
 */
function renderParam(param: Parameter, externalLinks: ExternalLinkInfo[]): string {
    const typeName = applyPrefixToTypeName(param.type.name, externalLinks);
    // A function or client parameter's default is the compiler's real default, so it is rendered whenever one
    // exists. This is deliberately NOT the listener-argument rule in `renderFixedService`, where a default is
    // emitted only for an optional parameter — a listener's "default" may be a type-derived placeholder for a
    // mandatory value. Do not unify the two.
    const defaultVal = param.default !== undefined ? ` = ${param.default}` : "";
    const annotations = renderInlineAttachments(param.annotations);
    return `${annotations}${typeName} ${param.name}${defaultVal}`;
}

/**
 * Renders a constructor function.
 */
function renderConstructor(func: RemoteFunction): string {
    const allExternalLinks = collectFunctionExternalLinks(func.parameters, func.return?.type);
    const params = func.parameters.map((param) => renderParam(param, allExternalLinks)).join(", ");
    const returnStr = func.return?.type ? ` returns ${applyPrefixToTypeName(func.return.type.name, allExternalLinks)}` : "";
    const agentNote = buildSpecialAgentNote(allExternalLinks);
    const anns = renderAttachmentBlock(func.annotations, "    ");
    return `${anns}    function init(${params})${returnStr};${agentNote}`;
}

/**
 * Renders a method declaration. `qualifier` is what precedes `function` — `"remote "` for a remote
 * method, `""` for a plain one.
 */
function renderMethod(func: RemoteFunction, qualifier: string, indent: string): string {
    const allExternalLinks = collectFunctionExternalLinks(func.parameters, func.return?.type);
    const desc = func.description ? `${indent}# ${func.description.split("\n").join(`\n${indent}# `)}\n` : "";
    const dep = func.isDeprecated ? `${indent}@deprecated\n` : "";
    const anns = renderAttachmentBlock(func.annotations, indent);
    const params = func.parameters.map((param) => renderParam(param, allExternalLinks)).join(", ");
    const returnStr = func.return?.type ? ` returns ${applyPrefixToTypeName(func.return.type.name, allExternalLinks)}` : "";
    const agentNote = buildSpecialAgentNote(allExternalLinks);
    return `${desc}${dep}${anns}${indent}${qualifier}function ${func.name}(${params})${returnStr};${agentNote}`;
}

/**
 * Renders a remote function.
 */
function renderRemoteFunction(func: RemoteFunction, indent: string = "    "): string {
    return renderMethod(func, "remote ", indent);
}

/**
 * Renders a plain (non-remote, non-resource) method — e.g. `sql:Client.close()` or
 * `sql:ResultIterator.next()`. Rendering these with the `remote` qualifier would not compile.
 */
function renderNormalFunction(func: RemoteFunction, indent: string = "    "): string {
    return renderMethod(func, "", indent);
}

/**
 * Renders one member of a class or client body.
 *
 * Dispatches on the declared function kind rather than by elimination: a class can hold plain
 * methods alongside remote ones, and treating everything that is not a constructor or resource as
 * `remote` mislabels them.
 *
 * Returns the lines to append, including the blank separator that precedes every member except the
 * constructor.
 */
function renderClassMember(func: RemoteFunction | ResourceFunction): string[] {
    const kind = (func as { type?: string }).type;
    if (kind === "Constructor") {
        return [renderConstructor(func as RemoteFunction)];
    }
    if ("accessor" in func) {
        return ["", renderResourceFunction(func as ResourceFunction)];
    }
    if (kind === "Normal Function") {
        return ["", renderNormalFunction(func as RemoteFunction)];
    }
    return ["", renderRemoteFunction(func as RemoteFunction)];
}

/**
 * Renders a resource function.
 */
function renderResourceFunction(func: ResourceFunction, indent: string = "    "): string {
    const allExternalLinks = collectFunctionExternalLinks(func.parameters, func.return?.type);
    const desc = func.description ? `${indent}# ${func.description.split("\n").join(`\n${indent}# `)}\n` : "";
    const dep = func.isDeprecated ? `${indent}@deprecated\n` : "";
    const anns = renderAttachmentBlock(func.annotations, indent);

    // Build path string
    const pathSegments = func.paths.map((p) => {
        if (typeof p === "string") {
            return p;
        }
        return `[${p.type} ${p.name}]`;
    });
    const pathStr = pathSegments.join("/");

    // Exclude parameters that appear in paths
    const pathParamNames = new Set(
        func.paths
            .filter((p): p is PathParameter => typeof p !== "string")
            .map((p) => p.name)
    );
    const nonPathParams = func.parameters.filter((p) => !pathParamNames.has(p.name));
    const params = nonPathParams.map((param) => renderParam(param, allExternalLinks)).join(", ");

    const returnStr = func.return?.type ? ` returns ${applyPrefixToTypeName(func.return.type.name, allExternalLinks)}` : "";
    const agentNote = buildSpecialAgentNote(allExternalLinks);
    return `${desc}${dep}${anns}${indent}resource function ${func.accessor} ${pathStr}(${params})${returnStr};${agentNote}`;
}

/**
 * Renders a client to Ballerina syntax.
 */
function renderClient(client: Client): string {
    const lines: string[] = [];
    const desc = client.description ? renderDescription(client.description) : "";
    const dep = client.isDeprecated ? "@deprecated\n" : "";
    const anns = renderAttachmentBlock(client.annotations, "");
    lines.push(`${desc}${dep}${anns}client class ${client.name} {`);

    for (const func of client.functions) {
        lines.push(...renderClassMember(func));
    }

    lines.push("}");
    return lines.join("\n");
}

/**
 * Renders a standalone (normal) function to Ballerina syntax.
 * Includes `# + param` and `# + return` documentation.
 */
function renderStandaloneFunction(func: RemoteFunction): string {
    const allExternalLinks = collectFunctionExternalLinks(func.parameters, func.return?.type);
    const lines: string[] = [];

    // Description
    if (func.description) {
        const descLines = func.description.split("\n").map((l) => `# ${l}`);
        lines.push(...descLines);
    }

    // Parameter docs
    for (const param of func.parameters) {
        if (param.description) {
            lines.push(`# + ${param.name} - ${param.description}`);
        }
    }

    // Return doc
    if (func.return?.description) {
        lines.push(`# + return - ${func.return.description}`);
    }

    if (func.isDeprecated) {
        lines.push("@deprecated");
    }

    lines.push(...renderAttachmentLines(func.annotations, ""));

    const params = func.parameters.map((param) => renderParam(param, allExternalLinks)).join(", ");
    const returnStr = func.return?.type ? ` returns ${applyPrefixToTypeName(func.return.type.name, allExternalLinks)}` : "";
    const agentNote = buildSpecialAgentNote(allExternalLinks);
    lines.push(`function ${func.name}(${params})${returnStr};${agentNote}`);

    return lines.join("\n");
}

/**
 * Spec §7 — the `#` line naming a slot's other legal types.
 *
 * Never `|`-joined. A `|`-joined type declares a parameter *of union type*; the spec means the author picks
 * one of these when writing the signature. Before this, every member after the first was invisible —
 * `rabbitmq`'s `BytesMessage` and `kafka`'s `BytesConsumerRecord[]` reached the prompt nowhere.
 */
function renderAlternativeNotes(method: ServiceRemoteFunction, listenerAlias: string | null,
                               indent: string): string[] {
    const lines: string[] = [];
    for (const param of method.parameters ?? []) {
        const alternatives = param.alternatives ?? [];
        // A repeatable slot's whole type surface is stated by `renderRepeatNotes`, in one sentence that
        // also says the slot repeats. Emitting a second "may also be" line for it would split one fact
        // across two notes and imply the slot appears in the signature, which it does not.
        if (alternatives.length === 0 || param.repeatable) {
            continue;
        }
        // Qualified, exactly as the signature one line below is. This note offers a type the reader may
        // WRITE IN PLACE OF the declared one, so it has to be written the way the reader must write it.
        const rendered = alternatives.map((type) => qualifyDeclaredType(type, listenerAlias));
        lines.push(`${indent}# ${paramLabel(param)} may also be: ${rendered.join(", ")}`);
    }
    return lines;
}

/**
 * Spec §7 `addMode: "many"` — the `#` lines describing a slot that repeats.
 *
 * The slot is deliberately absent from the signature (the document names no parameter, so writing one would
 * invent API), which makes this note the *only* place its type surface appears. It therefore states the
 * full surface — the codegen-default type plus every alternative — rather than deferring to
 * `renderAlternativeNotes` the way a fixed slot does. Types are module-qualified, as the reader must write
 * them.
 *
 * A slot the document leaves unnamed is identified by its annotation instead. `ballerina/http` declares two
 * repeatable slots with an identical type union and no names, so without that discriminator the same
 * sentence is emitted twice in a row.
 */
function renderRepeatNotes(method: ServiceRemoteFunction, listenerAlias: string | null,
                           indent: string): string[] {
    const lines: string[] = [];
    for (const param of method.parameters ?? []) {
        if (!param.repeatable) {
            continue;
        }
        const surface = [param.type, ...(param.alternatives ?? [])]
            .map((type) => qualifyDeclaredType(type, listenerAlias))
            .filter((name) => name !== "");
        // The name when the document states one; otherwise the annotation, which is what actually
        // distinguishes two same-typed slots from each other — `ballerina/http` declares a query slot and
        // a header slot with an identical type union and no names, and `@http:Query`/`@http:Header` are
        // the only things telling them apart.
        //
        // Phrased as identification, never as obligation: "annotated `@graphql:ID`" would assert that every
        // such parameter carries the annotation, one line above a note saying it only *may* be.
        const annotation = (param.annotationRefs ?? [])
            .map((ref) => qualifyRequirement(ref, listenerAlias).qualifiedName)[0];
        const discriminator = param.name
            ? ` (\`${param.name}\`)`
            : (annotation ? ` (the \`@${annotation}\` slot)` : "");
        const types = surface.length > 1
            ? `${surface[0]} (or ${surface.slice(1).join(", ")})`
            : surface[0] ?? "";
        lines.push(`${indent}# Zero or more further parameters${discriminator} of type ${types} may be `
            + `added, each independently named.`);
    }
    return lines;
}

/**
 * The suppression rule for §9 binding notes: a type the reader can already see in the signature or in the
 * `may also be` line is not repeated.
 *
 * Spec §7 makes the document state a slot's full static surface in `params[].type` "even where
 * `dataBindingRules` also says it", so the overlap is deliberate *in the document*. Repeating it in the
 * prompt is not: `ftp`'s `onFileCsv` would otherwise state the same four types three times.
 *
 * Returns the surviving `Type`s rather than their rendered names, because a §1.4 `subtypeFamily` reference
 * has to be *worded* differently and only the type carries the flag. Rendering here and re-deriving the
 * flag at the call site would be two places for the same fact.
 *
 * Named and tested rather than inlined, so "why is this type missing from the note?" has an answer.
 */
function suppressMembersAlreadyVisible(types: Type[] | undefined, visible: Set<string>,
                                       listenerAlias: string | null): Type[] {
    if (!types || types.length === 0) {
        return [];
    }
    const kept: Type[] = [];
    for (const type of types) {
        // Qualified on both sides of the comparison. The `visible` set is built the same way, so the
        // suppression still matches exactly — changing one side alone would make every type look novel
        // and re-state the whole surface the signature already shows.
        if (!visible.has(qualifyDeclaredType(type, listenerAlias))) {
            kept.push(type);
        }
    }
    return kept;
}

/**
 * A type name as a §9 note must refer to it.
 *
 * Spec §1.4 gives a data binding's `constraint`, its `excludes` and a shape's `envelope` an optional
 * `subtypeFamily`, which changes what the reference *means*: not "this exact type" but "this type and every
 * subtype of it, including one the reader declares themselves". `http:StatusCodeResponse` is the worked
 * case — a resource may return `http:Ok`, `http:Created`, or a user's own narrowing of either, and a note
 * naming only the family head would read as a single record it is not.
 *
 * Stated as a parenthetical rather than as a separate sentence so it attaches to the type it qualifies,
 * which matters most in an `excludes` list where several types may be named in one clause.
 */
function familyPhrase(type: Type | undefined, rendered: string): string {
    return type?.subtypeFamily ? `${rendered} (or any subtype of it)` : rendered;
}

/**
 * Spec §9 — the `#` lines describing how a parameter's value may be bound.
 *
 * One line per *variant*, because the variants are independent capabilities: binding a value directly and
 * binding a record that *includes* the connector's envelope are different pieces of code. A variant whose
 * every type is already visible contributes no line — with one exception, `excludes`, which is a negative
 * constraint no other part of the output can express.
 */
function renderBindingNotes(method: ServiceRemoteFunction, listenerAlias: string | null,
                            indent: string): string[] {
    const lines: string[] = [];
    for (const param of method.parameters ?? []) {
        const binding = param.binding;
        if (!binding || !binding.typedescs || binding.typedescs.length === 0) {
            continue;
        }
        const visible = new Set<string>([
            qualifyDeclaredType(param.type, listenerAlias),
            ...(param.alternatives ?? []).map((type) => qualifyDeclaredType(type, listenerAlias)),
        ]);
        for (const variant of binding.typedescs) {
            lines.push(...renderBindingVariant(variant, param.name ?? "", visible, listenerAlias, indent));
        }
    }
    return lines;
}

/**
 * One §9 variant, as zero or more `#` lines — one per shape it admits, plus at most one prohibition.
 *
 * **`excludes` belongs to the variant, so it is stated once.** Spec §9 puts it on the `typedescs[]` entry,
 * not on a shape: it names the instantiations a *sibling variant* owns, which is a fact about the variant as
 * a whole. Appending it to every shape line would repeat one prohibition once per embedding.
 */
function renderBindingVariant(variant: TypedescVariant, paramName: string, visible: Set<string>,
                              listenerAlias: string | null, indent: string): string[] {
    const bound = qualifyDeclaredType(variant.constraint, listenerAlias);
    // `excludes` is compared against an empty visible set on purpose: a prohibition is derivable from
    // nothing else, so it survives even when every positive member is already on the page.
    const excluded = suppressMembersAlreadyVisible(variant.excludes, new Set<string>(), listenerAlias)
        .map((type) => familyPhrase(type, qualifyDeclaredType(type, listenerAlias)));
    const rendered: string[] = [];
    for (const shape of variant.shapes ?? []) {
        const line = renderBindingShape(shape, bound, paramName, visible, listenerAlias);
        if (line) {
            rendered.push(line);
        }
    }
    if (excluded.length === 0) {
        return rendered.map((line) => `${indent}# ${line}`);
    }
    const prohibition = `— but never ${excluded.join(", ")}`;
    if (rendered.length === 1) {
        // One embedding, one sentence. Keeping the prohibition inline here is not cosmetic: it is what every
        // corpus variant carrying `excludes` renders today (kafka's, rabbitmq's two), and splitting it would
        // rewrite their output for a defect they do not exhibit.
        return [`${indent}# ${rendered[0]} ${prohibition}`];
    }
    if (rendered.length > 1) {
        // Several embeddings, one prohibition — stated once, after them. `excludes` is a property of the
        // VARIANT (spec §9 puts it on the `typedescs[]` entry), so appending it to each embedding presented
        // one restriction as many, and read as a rendering fault.
        return [
            ...rendered.map((line) => `${indent}# ${line}`),
            `${indent}# ...and in none of those forms may \`${paramName}\` bind to ${excluded.join(", ")}`,
        ];
    }
    // Every shape was suppressed because its bound is already visible in the signature. `excludes` is not:
    // it is a prohibition, derivable from nothing else on the page, so it must survive the suppression that
    // removed the positive half. Dropping it here is how a "never bind the envelope itself" rule would
    // silently vanish for any connector whose bound happens to match its parameter's declared type.
    return [`${indent}# \`${paramName}\` may bind directly to any type shown above`
        + ` — but never ${excluded.join(", ")}`];
}

/**
 * Spec §9.1 — the `#` lines describing how a handler's *return* may be narrowed.
 *
 * **The same construct as a parameter's binding, read in the opposite direction**, which is why it is
 * worded separately rather than routed through {@link renderBindingNotes}. A parameter's binding converts a
 * wire payload *into* the declared type, so "`msg` may bind to X" is the right sentence. A return's
 * converts the declared type *out* to wire form: the union already names the builtin the runtime accepts,
 * and what the document adds is that the reader may write something narrower in its place. "The return may
 * bind to `anydata`" would state the reverse of that, and would restate a member the signature one line
 * below already shows.
 *
 * **Nothing is suppressed here.** For a parameter, a type already visible in the signature is not repeated,
 * because the binding and the declared type say the same thing. For a return they do not: `anydata` in the
 * union is the *bound*, and the note is the only statement that a concrete type may replace it.
 *
 * Every corpus instance binds `anydata` — graphql's three operation shapes, grpc's four RPC kinds,
 * websocket's four message handlers, rabbitmq's `onRequest`, mcp's tool shapes and http's resource. Only
 * http carries a second variant, and only http's envelope is a §1.4 subtype family.
 */
function renderReturnBindingNotes(method: ServiceRemoteFunction, listenerAlias: string | null,
                                  indent: string): string[] {
    const binding = method.return?.binding;
    if (!binding || !binding.typedescs || binding.typedescs.length === 0) {
        return [];
    }
    const lines: string[] = [];
    for (const variant of binding.typedescs) {
        const bound = familyPhrase(variant.constraint,
            qualifyDeclaredType(variant.constraint, listenerAlias));
        for (const shape of variant.shapes ?? []) {
            const sentence = renderReturnBindingShape(shape, bound, listenerAlias);
            if (sentence) {
                lines.push(`${indent}# ${sentence}`);
            }
        }
        // A prohibition is derivable from nothing else on the page, so it survives whatever the shapes
        // above did or did not say — the same rule `renderBindingVariant` applies to a parameter's. No
        // corpus return declares one yet; spec §9.1 keeps the field legal, and a document that starts
        // using it must not lose it silently.
        const excluded = (variant.excludes ?? [])
            .map((type) => familyPhrase(type, qualifyDeclaredType(type, listenerAlias)));
        if (excluded.length > 0) {
            lines.push(`${indent}# ...but the return must never be ${excluded.join(", ")}.`);
        }
    }
    return lines;
}

/** One §9.1 shape, as the sentence describing what the return may be narrowed to. */
function renderReturnBindingShape(shape: BindingShape, bound: string,
                                  listenerAlias: string | null): string {
    if (shape.form === "included" || shape.element === "included") {
        if (!shape.envelope) {
            return "";
        }
        const envelopeLinks = collectExternalLinks(shape.envelope);
        // Qualified as the reader must write it, exactly as the parameter path qualifies its envelope.
        const envelope = envelopeLinks.length > 0
            ? applyPrefixToTypeName(shape.envelope.name, envelopeLinks)
            : (listenerAlias ? `${listenerAlias}:${shape.envelope.name}` : shape.envelope.name);
        const inclusion = shape.envelope.subtypeFamily
            ? `\`*${envelope};\` — or any subtype of \`${envelope}\` —`
            : `\`*${envelope};\``;
        const fields = shape.bindableFields ?? [];
        // The prohibition, not just the permission: naming the bindable field does not say the others are
        // fixed, and that is the whole content of `bindableFields`.
        const overrides = fields.length > 0
            ? ` and overrides only ${fields.map((field) => `\`${field}\``).join(", ")}`
            : "";
        const subject = shape.form === "array"
            ? `an array of records that include ${inclusion}`
            : shape.form === "stream"
                ? `a stream of records that include ${inclusion}`
                : `a record that includes ${inclusion}`;
        return `The return may instead be ${subject}${overrides}.`;
    }
    if (shape.form === "stream") {
        return `The returned stream's \`${bound}\` element may be narrowed: declare the concrete element`
            + ` type in place of \`${bound}\`.`;
    }
    if (shape.form === "array") {
        return `The returned array's \`${bound}\` element may be narrowed: declare the concrete element`
            + ` type in place of \`${bound}\`.`;
    }
    return `The \`${bound}\` member of the return may be narrowed: declare the concrete type you return in`
        + ` place of \`${bound}\`.`;
}

/** One §9 shape, or "" when it has nothing left to say after suppression. */
function renderBindingShape(shape: BindingShape, bound: string, paramName: string, visible: Set<string>,
                            listenerAlias: string | null): string {
    const includesEnvelope = shape.form === "included" || shape.element === "included";
    if (includesEnvelope) {
        if (!shape.envelope) {
            return "";
        }
        const envelopeLinks = collectExternalLinks(shape.envelope);
        // The inclusion is written in the *user's* module, so it carries an alias — the same rule the §8
        // attachment lines follow. `applyPrefixToTypeName` handles a cross-module envelope; a home-module
        // one takes the listener's alias.
        const envelope = envelopeLinks.length > 0
            ? applyPrefixToTypeName(shape.envelope.name, envelopeLinks)
            : (listenerAlias ? `${listenerAlias}:${shape.envelope.name}` : shape.envelope.name);
        // Spec §1.4: an envelope may name a whole subtype family rather than one record, and then the
        // inclusion the reader writes is of a *subtype* — `*http:Ok;` for `http:StatusCodeResponse`. The
        // head is still shown, because it is what the family is named by and what the reader looks up.
        const inclusion = shape.envelope.subtypeFamily
            ? `\`*${envelope};\` — or any subtype of \`${envelope}\` —`
            : `\`*${envelope};\``;
        const fields = shape.bindableFields ?? [];
        // The prohibition, not just the permission: naming the bindable field does not say the others are
        // fixed, and that is the whole content of `bindableFields`.
        const batched = shape.form === "array" || shape.form === "stream";
        const overrides = fields.length > 0
            ? ` and ${batched ? "override" : "overrides"} only `
              + fields.map((field) => `\`${field}\``).join(", ")
            : "";
        // Under a batched form the parameter takes an array (or stream) of these records, and this is the
        // one line where leaving that to the reader costs a compile error: `MyRecord` where `MyRecord[]` is
        // required. The English is pluralized; the type name is not — pluralizing that is what would
        // double-count against a signature that is already an array.
        const subject = shape.form === "array"
            ? `an array of records that include ${inclusion}`
            : shape.form === "stream"
                ? `a stream of records that include ${inclusion}`
                : `a record that includes ${inclusion}`;
        return `\`${paramName}\` may bind to ${subject}${overrides}`;
    }

    // The type the reader would actually WRITE for this shape — which is what has to be compared against
    // what is already on the page. Comparing the bare bound instead suppressed nothing for `array` and
    // `stream`: ftp's csv slot is declared `string[][]` while its bound is `string[]`, so the two never
    // matched and all four of its shapes restated types the signature had already given.
    const completion = shape.completionType
        ? qualifyDeclaredType(shape.completionType, listenerAlias)
        : "";
    const written = shape.form === "stream"
        ? (completion ? `stream<${bound}, ${completion}>` : `stream<${bound}>`)
        : shape.form === "array" ? `${bound}[]` : bound;
    if (visible.has(written)) {
        return "";
    }
    if (shape.form === "stream") {
        return `\`${paramName}\` may bind to a stream: ${written}`;
    }
    if (shape.form === "array") {
        return `\`${paramName}\` may bind to a batch: ${written}`;
    }
    return `\`${paramName}\` may bind directly to: ${written}`;
}

/**
 * Renders a ParameterDef (used in fixed service methods).
 *
 * Spec §7 `presence` is deliberately NOT expressed here. An optional handler parameter may be omitted from
 * the signature altogether, and neither shape that suggests itself is legal Ballerina: `Caller caller?` is
 * not a parameter form at all, and `Caller caller = ()` requires a nilable type and turns "may be omitted"
 * into "has a default". A `//` comment cannot go here either — inside a parameter list it would comment out
 * the closing paren and the return type. Optionality is therefore stated on a `#` line above the method, by
 * `renderParamPresenceNotes`.
 */
function renderParamDef(param: ParameterDef, listenerAlias: string | null = null): string {
    const annotations = renderRequirementAttachments(param.annotationRefs, listenerAlias);
    // Module-qualified, not `param.type.name` raw. The name arrives with the library's own prefix already
    // STRIPPED and an `internal` link carrying it instead, so the raw form is a type the reader's module
    // cannot see: `mcp`'s handler rendered `CallToolParams params` and the compiler answered
    // `ERROR unknown type 'CallToolParams'`. This is a handler signature meant to be copied verbatim, so
    // the alias has to go back on. `renderParam` (client/function parameters) is deliberately NOT changed:
    // those come from the symbol-processing pipeline, already carry the form the reader must write, and
    // re-qualifying them would double a prefix that is already correct.
    return `${annotations}${qualifyDeclaredType(param.type, listenerAlias)}`
        + `${param.name ? " " + param.name : ""}`;
}

/**
 * Spec §7 `presence` — the `#` lines stating, for each parameter in the signature, whether it may be
 * omitted.
 *
 * Returns nothing when every parameter is required, which is the common case: spec §7 makes `required` the
 * default, and the omission rule says a default is never restated.
 *
 * **Two-sided once anything is optional.** Naming only the omittable slots leaves the reader to infer the
 * obligation from absence. Where there is nothing required, that is said outright rather than left as an
 * empty category: `ballerina/http`'s handler has four parameters and *no* mandatory one, so listing only
 * the omittable ones reads as a list of caveats.
 */
function renderParamPresenceNotes(method: ServiceRemoteFunction, indent: string): string[] {
    // A repeatable slot is excluded from both lists: it is not in the signature, so neither "required" nor
    // "may be omitted" applies to it, and naming it here would advertise a parameter the reader cannot find
    // above. `renderRepeatNotes` states it instead.
    const inSignature = (method.parameters ?? [])
        .filter((param) => !param.repeatable && param.name);
    const optional = inSignature.filter((param) => param.optional).map((param) => param.name as string);
    if (optional.length === 0) {
        return [];
    }
    const required = inSignature.filter((param) => !param.optional).map((param) => param.name as string);
    return [
        required.length > 0
            ? `${indent}# Required parameters: ${required.join(", ")}`
            : `${indent}# Required parameters: none — every parameter in the signature may be omitted.`,
        `${indent}# Optional parameters (may be omitted): ${optional.join(", ")}`,
    ];
}

/**
 * Spec §5 `options[].presence` — the trailing marker stating whether the handler itself must be implemented.
 *
 * Three states, and the absent one is not the same as "required": under `addMode: "many"`, and for a concrete
 * service type's declared methods, the document says nothing about obligation, so neither marker is emitted.
 * `// optional` is the marker this renderer already used for an optional method; `// required` is its
 * counterpart, and before it existed a mandatory handler was indistinguishable from a skippable one.
 */
function renderPresenceMarker(method: ServiceRemoteFunction): string {
    if (method.optional === undefined || method.optional === null) {
        return "";
    }
    return method.optional ? " // optional" : " // required";
}

/**
 * The placeholder segment for a resource handler's path, and the note describing what may replace it.
 *
 * Spec §11.2: the concrete path is intent-derived, so only a placeholder is ever emitted — but a resource
 * function with no path at all does not compile, which is why the placeholder is mandatory rather than
 * decorative. The legal forms are quoted verbatim from the document; this renderer does not interpret them,
 * because spec §10 defines no vocabulary for `path.form`.
 */
const RESOURCE_PATH_PLACEHOLDER = "pathSegment";
// Spec §5 `accessor: {values: ["*"]}` — the document admits any accessor, so there is no value to write and
// the reader supplies one. A placeholder rather than a guess: picking `get` would be inventing API, and
// falling back to `remote function` prints a signature that contradicts the note above it saying an
// accessor is required. `ballerina/http`'s wildcard handler is the corpus instance.
const RESOURCE_ACCESSOR_PLACEHOLDER = "<accessor>";

/**
 * Spec §5 `options[].kind` — the method's keyword and, for a resource, its accessor and path placeholder.
 *
 * `remote function get(...)` is what this used to emit for `websocket`'s resource handler, and it does not
 * compile. A resource method needs both an accessor and a path, so:
 *  - the accessor comes from the wire, resolved by the Java-side AccessorPrecedencePolicy;
 *  - the path is a placeholder, because spec §11.2 makes the real one intent-derived.
 *
 * When the document declares a resource handler but supplies no accessor, falling back to `remote function`
 * is deliberate: it keeps the emitted source compilable, and `renderResourceNote` still states that the
 * handler is a resource whose accessor the document leaves unstated. Inventing `get` would be inventing API.
 * No corpus document reaches that fallback.
 */
/**
 * The accessor to print for a resource handler, or `undefined` when it is not one.
 *
 * Three states, each needing a different token: a document that names the accessor supplies it directly;
 * one that leaves the slot open (§5's `values: ["*"]`) gets a placeholder, because the reader chooses; and a
 * handler that is not a resource has no accessor position at all.
 *
 * The last branch is a genuine degradation. A `resource` handler whose document names no accessor and does
 * not open the slot either has nothing to put in that position, and `resource function  pathSegment(...)`
 * does not parse, so it falls back to `remote function` — correct only because the document said nothing,
 * and nothing currently reports that omission.
 */
function resourceAccessor(method: ServiceRemoteFunction): string | undefined {
    if (method.type !== "resource") {
        return undefined;
    }
    if (method.accessor) {
        return method.accessor;
    }
    return method.accessorOpen ? RESOURCE_ACCESSOR_PLACEHOLDER : undefined;
}

/**
 * The path segment to print for a resource handler.
 *
 * The document's own codegen default when it enumerates a vocabulary (spec §1: the first declared value),
 * otherwise the placeholder — because §11.2 makes an unconstrained path intent-derived, and inventing one
 * would be inventing API. Symmetric with {@link resourceAccessor}, since `path` and `accessor` are the same
 * `valueSpec`: a reader must never be handed `pathSegment` to replace while a note two lines above says the
 * path must be one of three specific values.
 */
function resourcePath(method: ServiceRemoteFunction): string {
    return method.path ?? RESOURCE_PATH_PLACEHOLDER;
}

function renderMethodSignature(method: ServiceRemoteFunction): string {
    // The declared `isolated` qualifier, when the service type's own declaration carries one. It leads the
    // signature because that is the only position Ballerina accepts, and it is not decoration: implementing
    // `mcp:AdvancedService`'s handlers without it fails with "mismatched function signatures", printing an
    // expected and a found half that are character-for-character identical — the compiler prints neither
    // qualifier, so the reader is given no way to see what differs.
    const qualifier = method.isolated ? "isolated " : "";
    const accessor = resourceAccessor(method);
    if (!accessor) {
        return `${qualifier}remote function ${method.name}`;
    }
    return `${qualifier}resource function ${accessor} ${resourcePath(method)}`;
}

/**
 * The spec's `deprecated`, as Ballerina's own `# # Deprecated` doc section.
 *
 * The spec words the obligation directly, and that form is chosen over a `//` note because the
 * `@deprecated` annotation already says *that* the construct is superseded and the language warns on it.
 * What only the document can supply is *what to use instead*, and Ballerina has a section for exactly that
 * — `ftp`'s `onFileChange` is the corpus instance.
 *
 * Two placement rules, both enforced by the compiler rather than by taste:
 *
 * - The separator is a `#` line, never a blank one. A blank line TERMINATES a Ballerina doc comment, which
 *   would detach the section — and everything above it — from the construct it documents.
 * - The caller must emit this LAST among the `#` lines. `# # Deprecated` opens a markdown section, so a
 *   `# + name - text` line placed below it stops being parameter documentation and `bal build` reports the
 *   parameter as undocumented.
 */
function renderDeprecationSection(deprecated: string | undefined, indent: string): string[] {
    if (!deprecated) {
        return [];
    }
    return [
        `${indent}#`,
        `${indent}# # Deprecated`,
        ...deprecated.split("\n").map((line) => `${indent}# ${line.trimEnd()}`),
    ];
}

function renderResourceNote(method: ServiceRemoteFunction, indent: string): string {
    const parts: string[] = [];
    // Spec §5's `accessor`, in the three states its ValueSpec can be in. An enumerated list and an open
    // slot must be worded differently: `values: ["*"]` means "any accessor the language accepts", and
    // printing the literal `*` as a value would tell the reader to write an accessor called `*`.
    if (method.accessorOpen) {
        const slot = `— replace \`${RESOURCE_ACCESSOR_PLACEHOLDER}\``;
        parts.push(method.accessorRequired === false
            ? `an accessor may be written, and it may be any the language accepts ${slot}`
            : `the accessor may be any the language accepts ${slot}`);
    } else if (method.accessorValues && method.accessorValues.length > 0) {
        const verbs = method.accessorValues.map((verb) => `\`${verb}\``).join(", ");
        parts.push(method.accessorRequired === false
            ? `the accessor may be one of ${verbs}`
            : `the accessor must be one of ${verbs}`);
    }
    // Spec §5 dropped the `identifierSegments` / `pathParamSegments` vocabulary because the language
    // already fixes what a resource path may look like — the old note restated the grammar back at a reader
    // who already had it. What remains is the one fact the language does NOT fix: that this handler needs a
    // path at all, and that its content is the author's to choose (§11.2).
    //
    // Unless the document says otherwise. `path` is the same `valueSpec` as `accessor`, so it may enumerate
    // the paths this connector accepts, and then the path is emphatically NOT author-chosen. The three cases
    // are worded exactly as the accessor's are, because they are the same three.
    const pathValues = method.pathValues ?? [];
    if (method.pathOpen) {
        parts.push(method.pathRequired === false
            ? `a path may be written, and it may be any the language accepts — replace \`${RESOURCE_PATH_PLACEHOLDER}\``
            : `the path may be any the language accepts — replace \`${RESOURCE_PATH_PLACEHOLDER}\``);
    } else if (pathValues.length > 0) {
        const paths = pathValues.map((path) => `\`${path}\``).join(", ");
        parts.push(method.pathRequired === false
            ? `the path may be one of ${paths}`
            : `the path must be one of ${paths}`);
    } else if (method.pathRequired) {
        parts.push(`a path is required and is author-chosen — replace \`${RESOURCE_PATH_PLACEHOLDER}\``);
    }
    // The label follows the handler's actual kind, not the spec section the extras are filed under: a
    // handler labelled "Resource:" above a `remote function` signature states the opposite of the line
    // below it. Under this spec revision §5 makes both slots resource-only, so the two agree for every
    // corpus handler — but nothing validates that, so the label stays derived rather than assumed.
    const label = method.type === "resource" ? "Resource" : "Handler";
    return parts.length === 0 ? "" : `${indent}# ${label}: ${parts.join("; ")}.\n`;
}

/**
 * The curated `service.md` block that precedes a synthesized service declaration.
 *
 * Returns nothing when the library ships no curated file, which is every library but `ballerina/http` and
 * `ballerina/graphql` — so the overwhelmingly common case is unchanged.
 *
 * The heading is `//`, not `#`: a `#` line immediately before the `service` declaration would be read as
 * that declaration's documentation, and this block is guidance about writing one, not documentation of the
 * one below.
 */
function renderServiceGuidance(instructions: string | undefined): string[] {
    if (!instructions || instructions.trim() === "") {
        return [];
    }
    return ["// --- Service writing guidance ---", instructions.trimEnd(), ""];
}

/**
 * Spec §2 `listeners[].doc` and §3 `serviceTypes[].doc` — the two required prose fields, as the `#`
 * documentation of the declaration that follows.
 *
 * **Why these are rendered at all.** Everywhere else the spec leaves out what introspection recovers;
 * these two invert it, and the 2026-08-19 revision made both required precisely so every top-level
 * construct in a document is self-describing. Nothing else in the catalog carries the same fact: a marker
 * service type's symbol has no doc comment to read, a concrete one's says what the *object type* is rather
 * than what writing a service against it accomplishes, and a class named `Listener` in a package named
 * `kafka` says only that something listens.
 *
 * **The service's doc leads, the listener's follows it named.** A Ballerina doc comment opens with the
 * description of the construct being declared, and the construct here is the service. The listener's is a
 * fact about the `on new …` clause rather than about the service, so it is attributed — the same shape
 * {@link renderDeprecationSection}'s listener line already uses, and for the same reason: unattributed, two
 * consecutive sentences about different constructs read as one.
 *
 * `#` rather than `//`, unlike the guidance block above them: this is documentation *of* the declaration,
 * not commentary about how to write one.
 */
function renderServiceDocNotes(service: Service): string[] {
    const lines: string[] = [];
    if (service.description && service.description.trim() !== "") {
        lines.push(...service.description.split("\n").map((line) => `# ${line.trimEnd()}`));
    }
    const listenerDoc = service.listener?.description;
    if (listenerDoc && listenerDoc.trim() !== "") {
        // Folded onto one line: a doc sentence split across `#` lines would read as two claims, and the
        // attribution prefix belongs to the whole of it.
        lines.push(`# Listener \`${service.listener.name}\`: `
            + `${listenerDoc.split("\n").map((line) => line.trim()).join(" ")}`);
    }
    return lines;
}

/**
 * Renders a generic service.
 */
function renderGenericService(service: GenericService): string {
    const lines: string[] = [];
    const listenerParams = service.listener.parameters.map(
        (p) => `${p.type.name} ${p.name}`
    ).join(", ");
    lines.push(`// --- Service (generic) ---`);
    if (service.name) {
        lines.push(`// Service Type: ${service.name}`);
    }
    // Spec §2/§3 `doc`. `//` rather than `#` here, because this whole block is commentary rather than a
    // declaration's documentation — a generic entry renders no `service` declaration to attach one to.
    // Curated overlay entries carry no doc, so in practice this fires only if a producer starts sending
    // one; stating it costs nothing and losing it silently would not.
    if (service.description) {
        lines.push(`// Description: ${service.description.split("\n").map((l) => l.trim()).join(" ")}`);
    }
    if (service.listener.description) {
        lines.push(`// Listener purpose: `
            + `${service.listener.description.split("\n").map((l) => l.trim()).join(" ")}`);
    }
    if (service.isDeprecated) {
        lines.push(`// Deprecated`);
    }
    if (service.deprecated) {
        lines.push(`// Deprecated: ${service.deprecated}`);
    }
    lines.push(`// Listener: ${service.listener.name}(${listenerParams})`);
    lines.push(`// Instructions:`);
    if (service.instructions) {
        lines.push(service.instructions);
    }
    return lines.join("\n");
}

/**
 * Derives the module alias from a listener name like `"kafka:Listener"` → `"kafka"`.
 * Returns null when the listener name lacks a `:` separator so callers can fall back
 * to the unprefixed `service on new ...` form.
 */
function deriveListenerAlias(listenerName: string): string | null {
    const idx = listenerName.indexOf(":");
    return idx > 0 ? listenerName.substring(0, idx) : null;
}

/**
 * Renders the spec §8 service-level annotation requirements that precede a `service` declaration.
 *
 * Emits, per annotation, a `#` line stating the obligation and an attachment line carrying a `{...}`
 * placeholder. Both are needed and neither is redundant: the placeholder is what the model fills in, and
 * the `#` line is the only thing that distinguishes "you must attach this" from "this exists" — the
 * library's own `// --- Annotations ---` section already lists every declaration it could attach, with
 * nothing marking which one this service is obliged to carry.
 *
 * A cross-module annotation takes its own module's prefix and a `// Special Agent Note`, exactly as every
 * other cross-module reference in this file does. A home-module one takes `listenerAlias`, mirroring how
 * `renderFixedService` prefixes a home-module service type.
 */
function renderServiceAnnotationLines(
    annotations: ServiceAnnotationRef[] | undefined,
    listenerAlias: string | null
): string[] {
    return renderAnnotationRequirementLines(annotations, listenerAlias, "service", "");
}

/**
 * Spec §8 at any attach point that renders as a declaration-level attachment — `service` and `function`.
 *
 * Generalised from the service-only version so a handler obligation reads identically to a service one:
 * both are requirements on code that does not exist yet, and a reader should not have to learn two
 * shapes. `subject` names what must carry it ("service" / "handler") and `indent` places the block, which
 * for a handler is inside the service body.
 *
 * Parameter and return scope are NOT rendered here: their attachments go inline, in the signature, where a
 * `#` line cannot follow them.
 */
function splitAnnotationRequirementLines(
    annotations: ServiceAnnotationRef[] | undefined,
    listenerAlias: string | null,
    subject: string,
    indent: string
): { notes: string[]; attachments: string[] } {
    if (!annotations || annotations.length === 0) {
        return { notes: [], attachments: [] };
    }

    // Notes and attachments are accumulated separately and concatenated, never interleaved. Ballerina
    // metadata requires every `#` documentation line to precede every annotation, so emitting
    // note-then-attachment per annotation would put a `#` line *after* an `@` as soon as one construct
    // carries two annotations at the same attach point — a hard syntax error ("missing close bracket
    // token").
    const notes: string[] = [];
    const attachments: string[] = [];
    for (const annotation of annotations) {
        if (!annotation || !annotation.name) {
            continue;
        }
        // Delegated rather than recomputed. This block and the in-signature form below state the same
        // requirement in two places, so a qualification rule implemented twice is one that will eventually
        // disagree with itself — and it already had.
        const { qualifiedName, constraint, provenanceNote } =
            qualifyRequirement(annotation, listenerAlias);
        const required = annotation.presence === "required";

        // `{...}` is not valid Ballerina, so the obligation line says outright that it has to be
        // replaced — and names the record supplying the fields wherever that is known, so the model
        // does not have to guess which of the library's records fills it. Several of these records have
        // mandatory fields (ftp's `ServiceConfiguration.path`, rabbitmq's `ServiceConfig.queueName`),
        // so an empty `{}` would not compile.
        const fields = constraint
            ? ` Replace {...} with its fields, which are those of ${constraint}.`
            : ` Replace {...} with its fields.`;
        // "Mandatory" rather than "Required": a listener's side-effect imports already render as
        // `# Requires: import ...;` directly above this, and two senses of "require" one line apart
        // read as one.
        notes.push(required
            ? `${indent}# Mandatory: this ${subject} must carry the @${qualifiedName} annotation.${fields}`
            : `${indent}# Optional: this ${subject} may carry the @${qualifiedName} annotation.${fields}`);

        // The presence marker is repeated on the attachment line because that line is what gets copied.
        // Without it a required and an optional annotation are visually identical, and attaching an
        // optional one whose record has mandatory fields turns a harmless omission into a compile error.
        // The note names what the model has to go and find in that package: the annotation itself and, when
        // known, the record constraining it. Grouped into the one comment the file's convention uses —
        // hence the `; `, which is why `qualifyRequirement` hands the note back unpunctuated.
        const provenance = provenanceNote ? `; ${provenanceNote}` : "";
        attachments.push(
            `${indent}@${qualifiedName} {...} // ${required ? "required" : "optional"}${provenance}`);
    }
    return { notes, attachments };
}

/**
 * The flattened form, for callers with nothing to put between the documentation and the annotations.
 *
 * <p>Documentation first, always: Ballerina metadata requires every `#` line to precede every annotation.
 */
function renderAnnotationRequirementLines(
    annotations: ServiceAnnotationRef[] | undefined,
    listenerAlias: string | null,
    subject: string,
    indent: string
): string[] {
    const { notes, attachments } = splitAnnotationRequirementLines(
        annotations, listenerAlias, subject, indent);
    return [...notes, ...attachments];
}

/**
 * The `alias:` a §8 requirement is written with: its own module's for a cross-module annotation, the
 * listener's for one the library declares itself. Shared by the declaration-level block above and the
 * inline parameter form below, so the two can never disagree about how a name is qualified.
 */
function qualifyRequirement(
    annotation: AnnotationRequirement,
    listenerAlias: string | null
): { qualifiedName: string; constraint?: string; provenanceNote: string } {
    const prefix = annotation.module ? deriveModulePrefix(annotation.module) : listenerAlias;
    const qualifiedName = prefix ? `${prefix}:${annotation.name}` : annotation.name;
    const constraintLinks = annotation.typeConstraint
        ? collectExternalLinks(annotation.typeConstraint)
        : [];
    // Qualified the same way a handler parameter's type is, and for the same reason: this names a record
    // the READER has to write in their own module. `applyPrefixToTypeName` only ever consults EXTERNAL
    // links, so a cross-module constraint came out right (`cdc:CdcServiceConfig`) while a home-module one
    // came out bare — a form that resolves to nothing outside the library. `qualifyDeclaredType` dispatches
    // on the link category the pipeline already attaches, so both cases are right.
    const constraint = annotation.typeConstraint
        ? qualifyDeclaredType(annotation.typeConstraint, listenerAlias)
        : undefined;
    const foreignNames = annotation.module
        ? [annotation.name, ...constraintLinks.map((link) => link.recordName)]
        : [];
    // The note itself, unpunctuated: a caller appending it to a `//` comment needs a `;` separator,
    // one appending it to a `#` sentence needs a space. Formatting it here would force one of them to
    // patch the other's punctuation back out.
    const provenanceNote = foreignNames.length > 0
        ? `Special Agent Note: ${[...new Set(foreignNames)].join(", ")} FROM ${annotation.module} package`
        : "";
    return { qualifiedName, constraint, provenanceNote };
}

/**
 * Spec §8 at the two attach points whose attachment goes *inside* the signature — `parameter`, written
 * before the parameter's type, and `return`, written into the return slot.
 *
 * Both positions are legal Ballerina: `remote function onMessage(@rabbitmq:Payload {} AnydataMessage msg)`
 * and `returns @http:Cache {} T` both compile. Two rules keep what is emitted there copyable:
 *
 * **1. `{}`, never `{...}`.** The `{...}` placeholder the declaration-level block uses is not an expression
 * — the compiler rejects it with "incompatible types: expected a map or a record, found 'other'". On its own
 * line it reads as a template a reader fills in; inside a signature it does not, because the signature is
 * copied as one unit. `{}` compiles wherever the constraining record has no required fields, which is every
 * such record in the corpus.
 *
 * **2. An optional annotation is described, not applied.** Same policy {@link renderIdentifierSlot} already
 * applies to an optional identifier. An inline attachment cannot carry a `// optional` marker — a comment
 * inside a signature would comment out everything after it — so an optional one written into the signature
 * would read as mandatory. Its presence and its constraint are stated by
 * {@link renderParamAnnotationNotes} instead.
 */
function renderRequirementAttachments(
    annotations: AnnotationRequirement[] | undefined,
    listenerAlias: string | null
): string {
    const required = (annotations ?? []).filter((annotation) => annotation.presence === "required");
    if (required.length === 0) {
        return "";
    }
    return required
        .map((annotation) => `@${qualifyRequirement(annotation, listenerAlias).qualifiedName} {}`)
        .join(" ") + " ";
}

/**
 * The `#` lines stating what each inline parameter annotation is and whether it is obligatory — the half
 * of a §8 requirement that cannot live in the parameter list.
 */
function renderParamAnnotationNotes(
    method: ServiceRemoteFunction,
    listenerAlias: string | null,
    indent: string
): string[] {
    const lines: string[] = [];
    for (const param of method.parameters ?? []) {
        for (const annotation of param.annotationRefs ?? []) {
            // A repeatable slot has no signature entry, so `param.name` would be undefined and the
            // "already written, fill the {}" branch would point at a `{}` that is nowhere on the page.
            // Both are corrected by naming the slot differently and always describing how to write it.
            // A handler may declare more than one repeatable slot — mcp's streamable template has two, and
            // only the `string`-union one carries @http:Header — so the slot is named by the type it
            // accepts, which is the only discriminator a slot without a name has.
            const subject = param.repeatable
                ? (param.name
                    ? `Each repeated \`${param.name}\` parameter`
                    : `Each repeated \`${param.type.name}\` parameter`)
                : `The ${paramLabel(param)} parameter`;
            lines.push(inSignatureNote(annotation, subject, "before its type", listenerAlias, indent,
                !param.repeatable));
        }
    }
    // The return carries its obligations in the same way and for the same reason: an optional one is not
    // written into `returns @X {} T`, so without a note it would render nowhere at all — the attach point
    // would be advertised and silent.
    for (const annotation of method.return?.annotationRefs ?? []) {
        lines.push(inSignatureNote(annotation, "The return", "in the `returns` clause",
            listenerAlias, indent));
    }
    return lines;
}

/**
 * One `#` line for a §8 requirement whose attachment lives inside the signature.
 *
 * A required annotation is already written there, so the note says what to put in it; an optional one is
 * not written at all, so the note says how to write it. `position` names where it goes, which differs
 * between a parameter and the return.
 *
 * `writtenInSignature` is false for a slot that has no signature entry at all — a spec §7 repeatable
 * parameter — where "fill the `{}`" would point at a placeholder that appears nowhere.
 */
function inSignatureNote(
    annotation: AnnotationRequirement,
    subject: string,
    position: string,
    listenerAlias: string | null,
    indent: string,
    writtenInSignature: boolean = true
): string {
    const { qualifiedName, constraint, provenanceNote } = qualifyRequirement(annotation, listenerAlias);
    const fields = constraint ? ` Its fields are those of ${constraint}.` : "";
    const obligation = annotation.presence === "required" && writtenInSignature
        ? `must carry @${qualifiedName} — fill the \`{}\`.`
        : `may carry @${qualifiedName}, written \`@${qualifiedName} {}\` ${position}.`;
    return `${indent}# ${subject} ${obligation}${fields}`
        + `${provenanceNote ? " " + provenanceNote : ""}`;
}



/**
 * Spec §3 `serviceTypes[].identifier` — the slot between `service` and `on new …`.
 *
 * Returns the syntax fragment (empty when nothing is written) and the `#` lines describing the slot.
 *
 * The placeholder is emitted **only for a required slot**. For an optional one the note states that the slot
 * may be filled and what shape it takes, but writing a placeholder would push the model to fill a slot the
 * connector does not need — and `rabbitmq`'s optional `stringLiteral` is precisely that case: it is one of two
 * alternatives its `oneOf` rule offers, and the constraint note already names it.
 *
 * An unrecognised form yields a note and no placeholder: spec §10 enumerates only `basePath` and
 * `stringLiteral`, and inventing syntax for a form whose shape is unknown would be worse than describing it.
 */
function renderIdentifierSlot(identifier: ServiceIdentifier | undefined): {
    fragment: string;
    notes: string[];
} {
    if (!identifier || !identifier.form || identifier.form.length === 0) {
        return { fragment: "", notes: [] };
    }
    // Spec §1's "first element is the codegen default", applied to a form list.
    const form = identifier.form[0];
    const required = identifier.presence === "required";
    const requirement = required ? "requires" : "accepts";
    // Spec §3 types `form` as an array with `minItems: 1` and no upper bound, so a connector may declare
    // that its identifier slot accepts EITHER shape. Only the first was described and the rest discarded
    // without trace, which contradicts `IdentifierResolver`'s own contract of keeping the whole list "so the
    // renderer can say which are legal". Every corpus document declares exactly one form.
    const alternatives = identifier.form.slice(1)
        .filter((other) => other && other !== form)
        .map(describeIdentifierForm);
    const alsoLegal = alternatives.length > 0
        ? ` It may instead be ${alternatives.join(", or ")}.`
        : "";

    // The prose for each form comes from `describeIdentifierForm`, which the `alsoLegal` clause above also
    // uses. Two separate copies of the same wording would let a reworded example land in one branch only,
    // leaving the primary form and the "may instead be" list describing the same shape differently.
    const note = `# The service identifier ${requirement} ${describeIdentifierForm(form)}`;
    // The placeholder is the one thing that does not follow from the description: only a form whose syntax
    // spec §10 fixes has one to write.
    const placeholder = form === "basePath" ? "/basePath "
        : form === "stringLiteral" ? `"identifier" ` : "";
    if (!required || placeholder === "") {
        return { fragment: "", notes: [`${note}${required ? "." : "; it may be omitted."}${alsoLegal}`] };
    }
    return {
        fragment: placeholder,
        notes: [`${note} — replace \`${placeholder.trim()}\`.${alsoLegal}`],
    };
}

/**
 * One alternative identifier form, as prose.
 *
 * Only the *placeholder* follows the codegen default (spec §1), so an alternative is described rather than
 * written — writing two would emit two identifier slots. A form outside spec §10's vocabulary is named
 * verbatim, for the reason the primary branch gives: inventing syntax for a shape whose grammar is unknown
 * would be worse than naming it.
 */
function describeIdentifierForm(form: string): string {
    if (form === "basePath") {
        return "a base path, e.g. `/orders`";
    }
    if (form === "stringLiteral") {
        return "a quoted string literal, e.g. `\"orders\"`";
    }
    return `a value of form \`${form}\``;
}

/**
 * Spec §6 `rules[]` — the `#` lines stating a service type's constraints.
 *
 * **The document's own `message` wins where it has one.** It is written by whoever knows the connector and
 * says *why* the constraint exists ("a RabbitMQ consumer needs its queue name from exactly one source"),
 * which nothing reconstructible from the subjects can match. The synthesized sentence is the fallback for a
 * rule that states none.
 *
 * The six registry entries are worded differently on purpose: only `exactlyOne` and `atLeastOne` oblige the
 * service to pick anything, and stating an obligation for `atMostOne` would invent one `websocket` does not
 * impose. An unrecognised rule id renders nothing — spec §6 requires it be skipped, and a note that cannot
 * say what the constraint *is* would be worse than silence.
 */
function renderConstraintLines(
    constraints: ServiceConstraint[] | undefined,
    listenerAlias: string | null
): string[] {
    if (!constraints || constraints.length === 0) {
        return [];
    }
    const lines: string[] = [];
    for (const constraint of constraints) {
        if (!constraint || !constraint.subjects || constraint.subjects.length === 0) {
            continue;
        }
        // A warning-severity rule is advice, not a requirement, and saying "is required" for one would
        // overstate what the connector enforces.
        const advisory = constraint.severity === "warning";
        if (constraint.message) {
            lines.push(`# ${advisory ? "Advisory: " : ""}${constraint.message}`);
            const preferred = preferredSubject(constraint, listenerAlias);
            if (preferred) {
                lines.push(`# Prefer ${preferred} unless the requirement says otherwise.`);
            }
            continue;
        }
        const rendered = constraint.subjects
            .map((subject) => renderConstraintSubject(subject, listenerAlias))
            .filter((text): text is string => text !== null);
        if (rendered.length === 0) {
            continue;
        }
        const asymmetric = renderAsymmetric(constraint, listenerAlias);
        if (asymmetric) {
            lines.push(`# ${advisory ? "Advisory: " : ""}${asymmetric}`);
            continue;
        }
        const lead = constraintLead(constraint);
        if (!lead) {
            continue;
        }
        lines.push(`# ${advisory ? "Advisory: " : ""}${lead}: ${rendered.join(" | ")}.`);
        const preferred = preferredSubject(constraint, listenerAlias);
        if (preferred) {
            lines.push(`# Prefer ${preferred} unless the requirement says otherwise.`);
        }
    }
    return lines;
}

/** The sentence opener for a symmetric registry entry, or null for one with no symmetric wording. */
function constraintLead(constraint: ServiceConstraint): string | null {
    switch (constraint.rule) {
        case "structure.exactlyOne":
            return "Exactly one of the following is required";
        case "structure.atMostOne":
            return "At most one of the following may be used";
        case "structure.atLeastOne":
            return "At least one of the following is required";
        case "structure.allOrNone":
            return "Use all of the following together, or none of them";
        default:
            // Includes the asymmetric entries, which `renderAsymmetric` has already handled, and any rule
            // id this renderer has no wording for.
            return null;
    }
}

/**
 * Spec §6.2's two asymmetric entries, whose subjects are NOT interchangeable.
 *
 * A `" | "`-joined list would read as a choice between them, which states the opposite of an implication.
 * The roles `when`/`then` are what make the direction recoverable, and the resolver drops any asymmetric
 * rule that lacks them — so reaching here without both is not possible, and returning null is the safe
 * response if it ever were.
 */
function renderAsymmetric(constraint: ServiceConstraint, listenerAlias: string | null): string | null {
    if (constraint.rule !== "structure.requires" && constraint.rule !== "structure.conflictsWith") {
        return null;
    }
    const when = constraint.subjects.find((subject) => subject.role === "when");
    const then = constraint.subjects.find((subject) => subject.role === "then");
    if (!when || !then) {
        return null;
    }
    const antecedent = renderConstraintSubject(when, listenerAlias);
    const consequent = renderConstraintSubject(then, listenerAlias);
    if (!antecedent || !consequent) {
        return null;
    }
    return constraint.rule === "structure.requires"
        ? `If you use ${antecedent}, you must also use ${consequent}.`
        : `If you use ${antecedent}, you must NOT use ${consequent}.`;
}

/** The `prefer` hint, resolved from a role to the subject it names. */
function preferredSubject(constraint: ServiceConstraint, listenerAlias: string | null): string | null {
    if (!constraint.prefer) {
        return null;
    }
    const subject = constraint.subjects.find((candidate) => candidate.role === constraint.prefer);
    return subject ? renderConstraintSubject(subject, listenerAlias) : null;
}

/**
 * One subject of a constraint.
 *
 * `annotation` is the resolved annotation name, so this reads as the same `@alias:Name` the §8 obligation
 * block renders a few lines above. The registry id it came from is deliberately not shown: it names nothing
 * that exists in Ballerina source.
 */
function renderConstraintSubject(
    subject: ConstraintSubject,
    listenerAlias: string | null
): string | null {
    const rendered = renderSubjectBody(subject, listenerAlias);
    if (rendered === null) {
        return null;
    }
    // Spec §6's top-level `rules[]`. The pipeline sets `serviceType` only for a subject belonging to a
    // DIFFERENT service type than the one being rendered, so a service-type-scoped rule reads exactly as
    // before. Naming the owner is not decoration: "exactly one of `onMessage` | `onRequest`" is a different
    // constraint from the same pair spread across two service types.
    const owner = subject.serviceType
        ? ` on the ${listenerAlias ? `\`${listenerAlias}:${subject.serviceType}\`` : `\`${subject.serviceType}\``} service`
        : "";
    return `${rendered}${owner}`;
}

/** One subject, without its service-type attribution. */
function renderSubjectBody(
    subject: ConstraintSubject,
    listenerAlias: string | null
): string | null {
    const prefix = listenerAlias ? `${listenerAlias}:` : "";
    switch (subject.kind) {
        case "identifier":
            return "the service identifier";
        case "annotation":
            return subject.annotation ? `@${prefix}${subject.annotation}` : null;
        case "annotationField": {
            if (!subject.annotation || !subject.path || subject.path.length === 0) {
                return null;
            }
            // Joined with `.` so a nested path reads as the field access it is. Spec §6.1 made this an
            // array precisely so `["retryConfig", "maxCount"]` is expressible; rendering only the first
            // segment would name a different field.
            return `the \`${subject.path.join(".")}\` field of @${prefix}${subject.annotation}`;
        }
        case "handler":
            return subject.name ? `\`${subject.name}\`` : null;
        case "param":
            return subject.name && subject.handler
                ? `\`${subject.handler}\`'s \`${subject.name}\` parameter`
                : null;
        default:
            return null;
    }
}

/**
 * Spec §2.1 `listeners[].platformDependencies` — native artifacts the build cannot fetch.
 *
 * Stated because nothing else can state it: a `requiredImport` is discoverable from the import list, but a
 * licensed jar appears in no repository the build can reach, and a missing **native** library is not even a
 * build failure — the package compiles and the service fails at run time. That is the whole reason the spec
 * carries this at all, so the per-OS entries are named individually rather than summarized.
 *
 * `#` lines rather than `//`, because they document the declaration that follows and belong with the other
 * obligations above it.
 */
function renderPlatformDependencyNotes(dependencies: PlatformDependency[] | undefined): string[] {
    if (!dependencies || dependencies.length === 0) {
        return [];
    }
    const lines: string[] = [];
    for (const dependency of dependencies) {
        if (!dependency || !dependency.coordinate) {
            continue;
        }
        const scope = dependency.provided
            ? " with `scope = \"provided\"`"
            : "";
        lines.push(`# Requires the platform dependency \`${dependency.coordinate}\`${scope}, declared in `
            + "Ballerina.toml under `[[platform.java21.dependency]]`.");
        if (dependency.acquisitionNote) {
            lines.push(`#   ${dependency.acquisitionNote}`);
        }
        if (dependency.acquisitionUrl) {
            lines.push(`#   Obtain it from ${dependency.acquisitionUrl}`);
        }
        for (const library of dependency.nativeLibraries ?? []) {
            if (!library || !library.os || !library.file) {
                continue;
            }
            const via = library.variable ? `, discoverable via \`${library.variable}\`` : "";
            lines.push(`#   Native library on ${library.os}: \`${library.file}\`${via}. `
                + "Absent, the service compiles and then fails at run time.");
        }
    }
    return lines;
}

/**
 * Spec §3 `multipleListenersAllowed` / `multipleServicesPerListenerAllowed` — stated only as prohibitions.
 *
 * The pipeline sends a key only when the connector forbids something, so there is no permissive case to
 * filter here. The default shape a generator writes — one service, one listener — is legal either way, so
 * the permissive value changes nothing it would otherwise produce, while the prohibition is what stands
 * between the model and code that does not compile.
 *
 * Two lines rather than one merged sentence: `kafka` is the only corpus service type where both fire, and a
 * combined line would state something false for `ballerinax/trigger.google.calendar`, where only the second
 * holds.
 */
function renderCardinalityNotes(service: Service): string[] {
    const lines: string[] = [];
    if (service.singleListenerOnly) {
        lines.push("# This service type attaches to exactly one listener — do not write `on l1, l2`.");
    }
    if (service.singleServiceOnly) {
        // Spec §2 `multipleServicesAllowed: false`. Strictly stronger than the same-type prohibition below,
        // and emitted instead of it: "at most one service" already entails "at most one of this type", so
        // stating both would present one restriction as two.
        lines.push("# This listener hosts at most one service in total — any second service, of any type, "
            + "needs its own listener.");
    } else if (service.singleServicePerListenerOnly) {
        lines.push("# This listener hosts at most one service of this type; a second one needs its own "
            + "listener.");
    }
    return lines;
}

/**
 * Spec §2 `listeners[].services` — the other listeners this service type may attach to.
 *
 * **What it is for.** A `service … on new …` clause names one listener, so the pipeline picks one and
 * writes it into the declaration. Where the document lists the same service type under several, the choice
 * is a *transport* choice: `ballerina/mcp` lists all four of its service types under both
 * `mcp:StreamableHttpListener` and `mcp:Listener`, and a reader asking for the stdio transport would
 * otherwise be shown only the HTTP one, with nothing on the page saying the other exists.
 *
 * Stated as a note rather than by emitting a second service entry per listener: the two would be identical
 * apart from one token, and a catalog that showed mcp's four service types eight times would read as eight
 * different things to write.
 *
 * `#`, and placed with the other cardinality notes, because it answers the same family of question — what
 * may attach to what — that spec §3.1 groups.
 */
function renderAlternativeListenerNote(service: Service): string[] {
    const alternatives = service.alternativeListeners ?? [];
    if (alternatives.length === 0) {
        return [];
    }
    const names = alternatives.map((name) => `\`${name}\``).join(", ");
    return [`# This service type may attach to ${names} instead of `
        + `\`${service.listener.name}\`, which the declaration below uses.`];
}

/**
 * Spec §4 `addMode: "many"` — the body of a service type whose handlers the author names.
 *
 * **Every line is a `//` comment, and that is forced rather than stylistic.** A `#` documentation line is
 * only legal immediately before a declaration; inside an otherwise empty service body the compiler answers
 * `ERROR documentation not attached to a construct`. The signature cannot be live code either: spec §11.1 is
 * explicit that such a handler "cannot yield a compilable signature", because the name is the author's to
 * choose.
 *
 * What is emitted is therefore a commented template that invents nothing beyond the name placeholder: the
 * kind, the parameter types, the return and the annotation obligations are all things the document states.
 * Types are module-qualified because the reader writes them in their own module.
 *
 * The filled-in form is *intended* to compile once a real name replaces `<handlerName>`, but that is a goal
 * rather than a verified guarantee: it does not necessarily hold where a compiler plugin imposes rules the
 * document cannot state, as `ballerina/http` does by requiring `@http:Payload` once a handler takes more
 * than one parameter. The library's own curated guidance carries the plugin rules.
 */
function renderHandlerTemplates(templates: ServiceRemoteFunction[] | undefined,
                                listenerAlias: string | null): string[] {
    if (!templates || templates.length === 0) {
        return [];
    }
    const indent = "    ";
    const many = templates.length > 1;
    // Spec §5 `options[].kind`, stated in the preamble rather than left to the signature below it. A
    // catalog whose every shape is `resource` accepts NOTHING else, and the compiler enforces it:
    // `ballerina/http` answers a remote method with "ERROR remote methods are not allowed in
    // http:Service". The generic wording ("any number of handlers") reads as permission to write a remote
    // one, so for a resource-only catalog the kind has to be named up front.
    const kinds = new Set(templates.map((template) => template.type));
    const kindWord = kinds.size === 1 && kinds.has("resource") ? "resource handlers"
        : (kinds.size === 1 && kinds.has("remote") ? "remote handlers" : "handlers");
    const lines: string[] = [
        `${indent}// This service type takes any number of ${kindWord}, and you choose each one's name.`,
        many
            ? `${indent}// Declare as many as the requirement needs, each following one of these `
              + `${templates.length} shapes:`
            : `${indent}// Declare as many as the requirement needs, following this shape:`,
    ];
    if (kinds.size === 1 && kinds.has("resource")) {
        lines.push(`${indent}// Only resource methods are accepted here — a remote method does not compile.`);
    }

    templates.forEach((template, index) => {
        if (many) {
            // Numbered rather than named. The shapes' semantics are already stated by their own notes —
            // graphql's `# Resource: … this is a GraphQL query` comes from `renderResourceNote` — so a label
            // here would either duplicate that or invent a name the document does not supply.
            lines.push(`${indent}//`);
            lines.push(`${indent}// Shape ${index + 1} of ${templates.length}:`);
        }
        lines.push(...renderHandlerTemplateBody(template, listenerAlias, indent));
    });
    // A blank line closes the block. Spec §5.1 let a service type carry templates AND named handlers at
    // once -- `websocket` declares nine of the latter beside two of the former -- and without this the last
    // commented signature ran straight into the first handler's `#` doc comment, so the two read as one.
    lines.push("");
    return lines;
}

/**
 * One template's notes, annotation obligations and commented signature.
 *
 * Split out of {@link renderHandlerTemplates} so the shared preamble is emitted once regardless of how many
 * shapes a catalog declares. For a single-shape catalog the emitted lines are byte-identical to what this
 * function produced before it was split.
 */
function renderHandlerTemplateBody(template: ServiceRemoteFunction,
                                   listenerAlias: string | null,
                                   indent: string): string[] {
    const lines: string[] = [];

    // `renderParamDef` is the same expression this built inline — required-annotation attachments, then the
    // qualified type, then the name when the document states one. A template's parameter list is a handler's
    // parameter list, so rendering it twice meant a change to either had to be made in both.
    const params = (template.parameters ?? [])
        .filter((param) => !param.repeatable)
        .map((param) => renderParamDef(param, listenerAlias))
        .join(", ");
    const returnType = qualifyDeclaredType(template.return?.type, listenerAlias);
    const returnStr = returnType ? ` returns ${returnType}` : "";
    // The same policy `renderMethodSignature` applies to a named resource handler: when the document
    // supplies no accessor there is none to write, and substituting `get` would be inventing API. Falling
    // back to `remote function` keeps the line copyable — the branch graphql's *mutation* shape takes.
    // A resource handler's *path* is what a remote handler's name is, so the author-chosen slot is the path
    // placeholder; appending `<handlerName>` after it as well would emit
    // `resource function get pathSegment <handlerName>(...)`, which is not a signature at all.
    const templateAccessor = resourceAccessor(template);
    const declarator = templateAccessor
        ? `resource function ${templateAccessor} ${resourcePath(template)}`
        : "remote function <handlerName>";

    // The same facts a real handler states, in the same order, but as `//` prose. Reused from the shared
    // renderers so that a change to what §7 or §8 says reaches the template automatically; only the `# `
    // marker is swapped, because of the compiler rule above.
    //
    // The list must stay in step with `renderHandlers`, the only other place a handler's notes are built. It
    // did not: `renderResourceNote`, `renderAlternativeNotes` and `renderBindingNotes` were missing here,
    // and a template is the ONLY shape an `addMode: "many"` catalog renders — so for `ballerina/http` its 8
    // legal accessors, 3 path forms and §9 binding rule reached the prompt nowhere. Ordered exactly as
    // `renderHandlers` orders them: what the handler is, then what its parameters may hold, then which may
    // be omitted.
    const notes = [
        // Spec §5.1's authored handler description. It was reaching the wire as `description` and being
        // dropped here, which was the one asymmetry in this block: the template's PARAMETER docs rendered
        // while the handler's own did not. For a wildcard catalog this text is the only statement of what
        // the handler is for, and `http`, `graphql` and `mcp` all author one.
        ...(template.description ? [template.description] : []),
        // Spec §5.3, in the `//` form this block uses throughout: a template is commented guidance, and a
        // `# # Deprecated` heading inside a `//` line is not a doc section, just a stray hash. The prose
        // still leads, for the reason `renderHandlers` gives -- it can make the reader not write it at all.
        ...(template.deprecated ? [`Deprecated: ${template.deprecated}`] : []),
        // Same as `renderHandlers`: a template's parameters carry authored docs too, and a wildcard catalog
        // is the ONLY shape such a service type renders, so omitting them here loses them entirely.
        ...(template.parameters ?? [])
            .filter((param) => param.name && param.description)
            .map((param) => `+ ${param.name} - ${param.description}`),
        ...(template.parameters ?? [])
            .filter((param) => param.name && param.deprecated)
            .map((param) => `Deprecated \`${param.name}\`: ${param.deprecated}`),
        renderResourceNote(template, "").trimEnd(),
        ...renderAlternativeNotes(template, listenerAlias, ""),
        ...renderRepeatNotes(template, listenerAlias, ""),
        ...renderBindingNotes(template, listenerAlias, ""),
        // Spec §9.1. A wildcard catalog is the ONLY shape such a service type renders, and every corpus
        // return binding but rabbitmq's and websocket's three named handlers sits on one — graphql's three
        // operations, grpc's four RPC kinds, mcp's tool, http's resource — so omitting it here would lose
        // the construct for almost every library that has it.
        ...renderReturnBindingNotes(template, listenerAlias, ""),
        ...renderParamAnnotationNotes(template, listenerAlias, ""),
        ...renderParamPresenceNotes(template, ""),
    ].filter((note) => note !== "");
    for (const note of notes) {
        lines.push(`${indent}// ${note.replace(/^# ?/, "")}`);
    }

    // The obligation block and the signature are the two lines a reader actually copies, so they are
    // written as real Ballerina behind the `// ` and nothing else: uncommenting them, substituting a name
    // and adding a body must compile. That is why `{}` appears here where the declaration-level block uses
    // `{...}` — `{...}` is not an expression, so it would turn a copyable line into a compile error the
    // moment the comment marker comes off.
    for (const annotation of template.annotationRefs ?? []) {
        const { qualifiedName, constraint, provenanceNote } =
            qualifyRequirement(annotation, listenerAlias);
        const required = annotation.presence === "required";
        const fields = constraint ? ` Its fields are those of ${constraint}.` : "";
        lines.push(`${indent}// A handler ${required ? "must" : "may"} carry @${qualifiedName}.${fields}`
            + `${provenanceNote ? " " + provenanceNote : ""}`);
        lines.push(`${indent}// @${qualifiedName} {} // ${required ? "required" : "optional"}`);
    }
    lines.push(`${indent}// ${declarator}(${params})${returnStr};`);
    return lines;
}


/**
 * The handler block shared by both shapes a fixed service can take.
 *
 * `terminator` is the only difference between them, and it is forced by the compiler rather than chosen:
 * a `service … on new …` declaration lists method *declarations* ending in `;`, whereas a `service class`
 * must *define* its methods — `remote function onOpen(websocket:Caller caller) returns error?;` inside one
 * is `ERROR missing equal token` / `missing external keyword`. Everything else about a handler — its notes,
 * its §8 obligations, its presence marker — is identical in both, so it is written once here.
 */
function renderHandlers(service: FixedService, listenerAlias: string | null,
                        terminator: string): string[] {
    const lines: string[] = [];
    for (const method of service.methods ?? []) {
        // `.trimEnd()` is load-bearing, not tidiness. An index-served description arrives with a trailing
        // newline, and appending another produced a BLANK LINE between the description and the `# + param`
        // lines below it. A blank line terminates a Ballerina doc comment, so the description became a
        // dangling comment and only the parameter docs attached to the handler. Four of salesforce's
        // handlers are affected.
        const desc = method.description ? `    # ${method.description.trimEnd()}\n` : "";
        // Spec §5.1 makes the document author a `doc` for every parameter of a non-concrete handler,
        // because no symbol carries one. Rendered as Ballerina's own `# + name - text` parameter
        // documentation, the same form `renderStandaloneFunction` uses — without this the ~150 authored
        // parameter descriptions in the corpus reach the prompt nowhere.
        const paramDocs = (method.parameters ?? [])
            .filter((param) => param.name && param.description)
            .map((param) => `    # + ${param.name} - ${param.description}`);
        // Spec §7's per-slot `deprecated`. Kept out of the `# + name - text` line rather than appended to
        // the description: those lines are Ballerina's parameter documentation and a reader copying one
        // into their own doc comment would carry the deprecation notice with it.
        const paramDeprecations = (method.parameters ?? [])
            .filter((param) => param.name && param.deprecated)
            .map((param) => `    # Deprecated \`${param.name}\`: ${param.deprecated}`);
        // Spec §5.3's prose, as its own doc section. It must be the LAST `#` block of the comment, which
        // the compiler decides rather than taste: `# # Deprecated` opens a markdown section, so every `#`
        // line after it becomes that section's BODY. Emitting it first swallowed the `# + watchEvent` line
        // below it and `bal build` reported `undocumented parameter 'watchEvent'`.
        const deprecationSection = renderDeprecationSection(method.deprecated, "    ");
        const depBlock = deprecationSection.length > 0 ? deprecationSection.join("\n") + "\n" : "";
        // The annotation is not optional beside the section: `bal build` rejects the documentation without
        // it -- "'Deprecated' documentation is only allowed on constructs annotated as '@deprecated'". So
        // the document's prose is sufficient reason to write `@deprecated`; gating it on `isDeprecated`
        // alone emitted a warning-generating pair for `ftp`'s `onFileChange`.
        //
        // The two still say different things: the annotation makes the compiler warn, the section names the
        // replacement.
        const dep = method.isDeprecated || method.deprecated ? "    @deprecated\n" : "";
        // Spec §7: a repeatable slot is never written into the signature — the document states no name
        // for it, so emitting one would invent a parameter. `renderRepeatNotes` states it instead.
        const params = (method.parameters ?? [])
            .filter((param) => !param.repeatable)
            .map((param) => renderParamDef(param, listenerAlias)).join(", ");
        const returnAnnotations = renderRequirementAttachments(
            method.return?.annotationRefs, listenerAlias);
        // Qualified for the same reason the parameters are: `returns ListToolsResult|ServerError` named two
        // types the reader's module cannot see. A union is handled member-wise by `qualifyDeclaredType`,
        // which prefixes only the members carrying a link — so `error?` and `anydata|error` stay untouched.
        const returnStr = method.return?.type
            ? ` returns ${returnAnnotations}${qualifyDeclaredType(method.return.type, listenerAlias)}`
            : "";

        // Documentation order mirrors a real Ballerina doc comment: the description leads, then every note
        // about the signature, and only then the annotations — Ballerina metadata puts every `#` line ahead
        // of every annotation, so both the §8 obligation block and `@deprecated` follow the notes.
        //
        // Within the notes the order is: what the handler is (description, resource shape), then what its
        // parameters may hold (alternatives, then how they bind), then which of them may be omitted, then
        // what their annotations mean. Each layer is narrower than the one above it.
        const notes = [
            paramDocs,
            paramDeprecations,
            renderAlternativeNotes(method, listenerAlias, "    "),
            renderRepeatNotes(method, listenerAlias, "    "),
            renderBindingNotes(method, listenerAlias, "    "),
            // Spec §9.1, immediately after the inbound bindings: the two are the same construct read in
            // opposite directions, so a reader meets everything the document says about projection in one
            // place rather than with the annotation notes between them.
            renderReturnBindingNotes(method, listenerAlias, "    "),
            renderParamAnnotationNotes(method, listenerAlias, "    "),
        ].flat();
        const noteBlock = notes.length > 0 ? notes.join("\n") + "\n" : "";
        // Split rather than flattened, because §5.3's section has to go BETWEEN the two halves. §8's
        // obligation block is a `#` note plus an `@X {...}` attachment, and Ballerina requires every `#`
        // line to precede every annotation — so appending the deprecation section after the whole block put
        // documentation below an annotation. `ftp`'s `onFileChange` is the one handler that is both.
        const obligations = splitAnnotationRequirementLines(
            method.annotationRefs, listenerAlias, "handler", "    ");
        const obligationNotes = obligations.notes.length > 0
            ? obligations.notes.join("\n") + "\n" : "";
        const obligationAttachments = obligations.attachments.length > 0
            ? obligations.attachments.join("\n") + "\n" : "";
        const presence = renderParamPresenceNotes(method, "    ");
        const presenceBlock = presence.length > 0 ? presence.join("\n") + "\n" : "";

        lines.push(`${desc}${renderResourceNote(method, "    ")}${noteBlock}`
            + `${presenceBlock}${obligationNotes}${depBlock}${obligationAttachments}`
            + `${dep}    ${renderMethodSignature(method)}(${params})${returnStr}${terminator}`
            + `${renderPresenceMarker(method)}`);
        lines.push("");
    }
    return lines;
}

/**
 * Spec §2 `listeners[].services` — a service type no listener declares it can host.
 *
 * Such a type cannot be written as `service … on new …`: the compiler rejects
 * `service websocket:Service on new websocket:Listener(...)` with "service type is not supported by the
 * listener". But it is not dead either — `websocket`'s `Service` is the *return* of its `UpgradeService`
 * resource, and its nine handlers exist nowhere else in the catalog, because the library's own `Service`
 * object type is a marker that declares none of them. It is written as what a reader actually writes
 * instead.
 *
 * Three things are deliberately NOT carried over from the attachment shape, each because it is illegal or
 * meaningless here rather than merely redundant:
 *  - **the §8 service-scope annotation block** — `@websocket:ServiceConfig` on a `service class` is
 *    `ERROR annotation … is not allowed on class`; those annotations are declared `on service`, and a class
 *    is not a service declaration;
 *  - **the §3 cardinality notes** — they describe how many listeners the type may attach to, and it
 *    attaches to none;
 *  - **the §3 identifier slot** — there is no `service <identifier> on new …` line to put one in.
 *
 * The §6 constraint notes ARE carried over, and they are load-bearing: compiling this block with all nine
 * websocket handlers gives exactly `Cannot have onTextMessage with onMessage remote function` and the
 * matching `onBinaryMessage` error.
 */
function renderServiceClass(service: FixedService, listenerAlias: string | null): string {
    const lines: string[] = [];

    // Spec §2/§3 `doc`, leading for the reason `renderFixedService` gives. A type reached as the return of
    // another service's resource still needs saying what it is for — more so, since no `service … on new …`
    // line names it.
    lines.push(...renderServiceDocNotes(service));

    // Spec §2: the listener's side-effect imports still belong to the program that hosts this type, so they
    // are stated rather than dropped — the enclosing service still constructs the listener.
    for (const directive of service.requiredImports ?? []) {
        if (directive && directive.module) {
            const alias = directive.alias ? ` as ${directive.alias}` : "";
            lines.push(`# Requires: import ${directive.module}${alias};`);
        }
    }
    lines.push(...renderPlatformDependencyNotes(service.platformDependencies));
    lines.push(...renderConstraintLines(service.constraints, listenerAlias));

    const foreignModule = service.serviceTypeModule;
    const alias = (foreignModule ? deriveModulePrefix(foreignModule) : "") || listenerAlias;
    const qualifiedType = service.name && alias ? `${alias}:${service.name}` : service.name ?? "";
    const agentNote = foreignModule && service.name
        ? ` // Special Agent Note: ${service.name} FROM ${foreignModule} package`
        : "";

    lines.push(`// This service type is never attached to a listener — no listener in this library `
        + `declares it.`);
    lines.push(`// Write it as a \`service class\` that includes the type, and return an instance of that `
        + `class`);
    lines.push(`// wherever a \`${qualifiedType}\` is required.`);
    lines.push(...renderDeprecationSection(service.deprecated, ""));
    if (service.isDeprecated || service.deprecated) {
        lines.push("@deprecated");
    }
    // A concrete, legal identifier rather than a `<placeholder>`: the reader renames it, and an unlexable
    // token here would break the one block in this section that is meant to compile as written.
    lines.push(`service class ${service.name ?? "Service"}Impl {${agentNote}`);
    lines.push(`    *${qualifiedType};`);
    lines.push("");
    // Spec §4 `addMode: "many"`: an open-ended catalog's handler shape belongs here too. No corpus service
    // type is both open-ended and unattachable, so this is latent — but omitting it would silently delete
    // the *only* description of how to write a handler for such a type, which is the one thing this block
    // exists to convey.
    lines.push(...renderHandlerTemplates(service.handlerTemplates, listenerAlias));
    // `{ }` rather than `;` — a class defines its methods; see `renderHandlers`.
    lines.push(...renderHandlers(service, listenerAlias, " { }"));

    if (lines[lines.length - 1] === "") {
        lines.pop();
    }
    lines.push("}");
    return lines.join("\n");
}

/**
 * Renders a fixed service.
 */
function renderFixedService(service: FixedService): string {
    const lines: string[] = [];
    // Hoisted above the listener arguments because they need it too — see the qualification note below.
    const listenerAlias = deriveListenerAlias(service.listener.name);

    // Spec §2 `listeners[].services`: a service type no listener can host takes an entirely different
    // shape, so the branch is taken before any of the attachment-specific notes are built.
    if (service.notListenerAttachable) {
        return renderServiceClass(service, listenerAlias);
    }

    // Curated guidance, when the library ships a `service.md` this entry absorbed. Emitted FIRST, and as
    // raw markdown rather than `#` documentation lines: prose frames the declaration that follows, and
    // `#`-prefixing a multi-kilobyte block with fenced code samples would turn it into a Ballerina doc
    // comment attached to the service — legal, but far harder to read. Same raw form
    // `renderGenericService` has always used.
    lines.push(...renderServiceGuidance(service.instructions));

    // Spec §2/§3 `doc`. First among the `#` lines, because a Ballerina doc comment opens with the
    // description of the construct it documents and everything below is a caveat about writing it.
    lines.push(...renderServiceDocNotes(service));

    // A default is emitted ONLY for an optional parameter. Every parameter used to get one, which told the
    // model that a mandatory value — kafka's `bootstrapServers`, grpc's `port` — had a default it could
    // leave alone. The `optional` flag has always been on the wire (set from the init method's
    // DEFAULTABLE/INCLUDED_RECORD parameter kind); it was simply not consulted.
    //
    // The type is module-qualified for the same reason a handler parameter's is: this argument list is part
    // of a `service ... on new ...` line the reader copies whole, and the library's own prefix was stripped
    // on the way out. Rendered raw it produced `ListenerConfiguration config = {}` for mcp, websocket,
    // websub and grpc, which resolves in no reader's module. `renderGenericService` renders its own listener
    // line and is deliberately left alone: it serves the hand-written http/graphql overlay.
    const listenerParams = service.listener.parameters.map((p) => {
        const suffix = p.optional === true && p.default !== undefined ? ` = ${p.default}` : "";
        return `${qualifyDeclaredType(p.type, listenerAlias)} ${p.name}${suffix}`;
    }).join(", ");

    // Spec §2: the listener's side-effect imports are required only by code that uses this service,
    // so they are stated here rather than hoisted to the library header.
    for (const directive of service.requiredImports ?? []) {
        if (directive && directive.module) {
            const alias = directive.alias ? ` as ${directive.alias}` : "";
            lines.push(`# Requires: import ${directive.module}${alias};`);
        }
    }

    // Spec §8: stated here rather than at the library level because the obligation belongs to this
    // service type. The prefix for a home-module annotation is the listener's alias — never
    // `serviceTypeModule`'s, which names where the *service type* lives and is a different module
    // whenever the two diverge (mssql's type is `cdc:Service` while its own annotations would be
    // `mssql:`-prefixed).
    //
    // Emitted before `@deprecated` on purpose: Ballerina metadata puts every `#` documentation line
    // ahead of every annotation, and this block leads with one. Pushing it after `@deprecated` would
    // sandwich documentation between two annotations for a service that is both deprecated and
    // carries a §8 obligation — a shape no corpus document has today, which is exactly why the
    // ordering has to be right by construction rather than by observation.
    //
    // (`listenerAlias` is computed at the top of this function, where the listener arguments need it.)

    // Spec §3 and §6, both stated as `#` lines above the declaration for the same reason the §8 block is:
    // they are obligations on code that does not exist yet, and Ballerina metadata puts documentation ahead
    // of annotations. The identifier note precedes the constraint lines because a constraint may refer to the
    // identifier as one of its alternatives.
    // Spec §3's cardinality, first among the service-level notes because it is the only one that can make
    // the reader write a *different number* of declarations rather than a different declaration.
    lines.push(...renderPlatformDependencyNotes(service.platformDependencies));
    lines.push(...renderCardinalityNotes(service));
    lines.push(...renderAlternativeListenerNote(service));

    const identifierSlot = renderIdentifierSlot(service.identifier);
    lines.push(...identifierSlot.notes);
    lines.push(...renderConstraintLines(service.constraints, listenerAlias));

    lines.push(...renderServiceAnnotationLines(service.annotations, listenerAlias));

    // Spec §3 and §2 `deprecated`, as doc sections rather than notes -- see `renderDeprecationSection`.
    // Last among the `#` lines and immediately before the annotations, because Ballerina metadata puts
    // every `#` line ahead of every annotation and `@deprecated` is the annotation this pairs with.
    //
    // The listener's own deprecation is stated here too: a service is written `on new <listener>(...)`, so
    // a superseded listener is a fact about the declaration a reader is about to write, and stating it
    // anywhere else would be stating it nowhere they would look.
    lines.push(...renderDeprecationSection(service.deprecated, ""));
    lines.push(...renderDeprecationSection(
        service.listener.deprecated ? `Listener \`${service.listener.name}\`: `
            + service.listener.deprecated : undefined, ""));

    // Paired with the section above for the compiler's reason, not for symmetry: `bal build` rejects
    // `# # Deprecated` documentation on a construct that is not annotated `@deprecated`. The document's
    // prose is therefore sufficient reason to write the annotation, even where no symbol carries one.
    if (service.isDeprecated || service.deprecated || service.listener.deprecated) {
        lines.push("@deprecated");
    }

    // Spec §1: a cross-module service type is written with its own module's prefix; only a
    // home-module type borrows the listener's. Writing `mssql:Service` for `ballerinax/cdc`'s type
    // would not compile. Its provenance travels in the same `Special Agent Note` every other
    // cross-module reference in the catalog uses, rather than an import.
    const foreignModule = service.serviceTypeModule;
    const alias = (foreignModule ? deriveModulePrefix(foreignModule) : "") || listenerAlias;
    const serviceTypePrefix = service.name && alias
        ? `${alias}:${service.name} `
        : "";
    const agentNote = foreignModule && service.name
        ? ` // Special Agent Note: ${service.name} FROM ${foreignModule} package`
        : "";
    lines.push(`service ${serviceTypePrefix}${identifierSlot.fragment}on new `
        + `${service.listener.name}(${listenerParams}) {${agentNote}`);

    // Spec §4 `addMode: "many"`: an open-ended catalog has no methods to list, so the body carries the
    // rule for writing one instead. Emitted before the methods because no corpus service type has both,
    // and a template that followed real methods would read as an afterthought rather than as the shape
    // every handler here takes.
    lines.push(...renderHandlerTemplates(service.handlerTemplates, listenerAlias));

    lines.push(...renderHandlers(service, listenerAlias, ";"));

    // Remove trailing empty line
    if (lines[lines.length - 1] === "") {
        lines.pop();
    }

    lines.push("}");
    return lines.join("\n");
}

/**
 * Renders one library annotation declaration, given every attach point it was declared at.
 *
 * An attach point with no entry in `ATTACHMENT_POINT_LABELS` is dropped by the caller. That is the
 * deliberate treatment for a point Ballerina has no declarable syntax for (`OBJECT`): the catalog is the
 * model's authoritative API reference, so a declaration that cannot compile is worse than a declaration
 * that is absent — the model can discover a missing annotation from the compiler, but it will copy an
 * uncompilable one straight into the generated file.
 *
 * **The points share one declaration, and that is required rather than tidy.** Ballerina declares an
 * annotation once with an attach-point *list*; emitting one declaration per point redeclares the same
 * symbol, which the compiler rejects. Verified against 2201.13.4, all four forms build:
 * <pre>
 *   public annotation Cfg A1 on parameter, return, record field;
 *   public annotation A2 on parameter, return, record field;          // no type constraint
 *   public const annotation Cfg A3 on source listener, source worker;
 *   public const annotation Cfg A5 on source listener, parameter;     // mixed, still one declaration
 * </pre>
 * Two rules fall out of those probes and are both load-bearing:
 *  - every source-only point carries its **own** `source` keyword — `on source listener, worker` is
 *    `ERROR missing source keyword`, so the qualifier cannot be hoisted onto the list;
 *  - one source-only point anywhere in the list makes the **whole** declaration `const`, and mixing it
 *    with a normal point is legal, so the list never has to be split across two declarations.
 */
function renderAnnotationDeclaration(annotation: Annotation, points: AttachmentPoint[]): string {
    // `const` is a property of the declaration, not of a point: one source-only member obliges it for all.
    const keyword = points.some((point) => point.sourceOnly)
        ? "public const annotation" : "public annotation";
    const onClause = points
        .map((point) => (point.sourceOnly ? `source ${point.token}` : point.token))
        .join(", ");

    const lines: string[] = [];
    if (annotation.description) {
        const descBody = annotation.description
            .split("\n")
            .map((l) => `# ${l}`)
            .join("\n");
        lines.push(descBody);
    }

    let typeSlot = "";
    let agentNote = "";
    if (annotation.typeConstraint) {
        const externalLinks = collectExternalLinks(annotation.typeConstraint);
        // NOT `qualifyDeclaredType` here, deliberately. This line is the library's OWN declaration,
        // written as the library's module writes it, so a home-module constraint is bare — the opposite
        // of the §8 requirement lines, which describe code in the reader's module and do take the alias.
        const typeName = applyPrefixToTypeName(annotation.typeConstraint.name, externalLinks);
        typeSlot = `${typeName} `;
        agentNote = buildSpecialAgentNote(externalLinks);
    }

    lines.push(`${keyword} ${typeSlot}${annotation.name} on ${onClause};${agentNote}`);
    return lines.join("\n");
}

/**
 * The library's annotation declarations, one per declared annotation rather than one per attach point.
 *
 * The catalog arrives with the 1:N relationship already flattened: the compiler reports one
 * `AnnotationSymbol` carrying N attach points, and the wire model's `attachmentPoint` is singular, so the
 * producer emits N rows for a single Ballerina declaration. Rendering those rows verbatim redeclares the
 * symbol — `ballerina/graphql` printed `ID` three times, `ballerina/http` printed four such pairs
 * (`Payload`, `Header`, `Query`, `ServiceConfig`), and `ballerinax/rabbitmq` and `ballerina/ai` two each.
 * Copied into a file, every repeat after the first is a redeclaration error.
 *
 * Regrouping here rather than in the producer is deliberate: the wire shape is consumed elsewhere, and
 * this is a rendering decision — how to *write* what the compiler reported, not what it reported.
 *
 * Rows are keyed by name **and** constraint. Two rows for one symbol always agree on both, so the key
 * merges exactly the rows that came from a single declaration; a hypothetical name collision carrying
 * different constraints stays split rather than being silently merged into a declaration neither library
 * made. Group and token order follow first appearance, so output is stable and diff-friendly.
 */
function renderAnnotationDeclarations(annotations: Annotation[]): string[] {
    interface Group {
        annotation: Annotation;
        points: AttachmentPoint[];
    }
    const groups = new Map<string, Group>();
    for (const annotation of annotations) {
        if (!annotation || !annotation.name) {
            continue;
        }
        const point = ATTACHMENT_POINT_LABELS[annotation.attachmentPoint];
        if (!point) {
            // A point with no declarable syntax. Dropped exactly as before — but only this point, so an
            // annotation declared at both a declarable and an undeclarable one still renders.
            continue;
        }
        const key = `${annotation.name}\u0000${annotation.typeConstraint?.name ?? ""}`;
        const group = groups.get(key);
        if (!group) {
            groups.set(key, { annotation, points: [point] });
        } else if (!group.points.includes(point)) {
            group.points.push(point);
        }
    }
    return Array.from(groups.values())
        .map((group) => renderAnnotationDeclaration(group.annotation, group.points));
}

/**
 * Spec §3's array cardinality — stated **once per library**, not once per service.
 *
 * The claim is about the *set* of service types a document declares, so repeating it on each entry says
 * nothing extra; `ballerinax/trigger.github` would carry ten identical copies of it.
 *
 * The wording follows §3 literally and deliberately does **not** say "pick exactly one" — §3 imposes no
 * such rule, and `websocket` is the counter-example: its `UpgradeService` handler *returns* its `Service`,
 * so both are routinely declared together.
 *
 * `//` rather than `#`: a `#` line here would attach to the first service declaration as its documentation.
 *
 * The count comes from the entries actually rendered, so a service type dropped by a veto can never make
 * this line promise something the reader cannot find below.
 */
function renderServiceAlternativesNote(services: Service[]): string[] {
    const count = services.filter((service) => service.alternatives).length;
    if (count < 2) {
        return [];
    }
    return [
        "",
        `// This library declares ${count} service types. Each is individually optional —`,
        "// declare the ones the requirement needs, not all of them.",
    ];
}

/**
 * Renders a service to Ballerina syntax.
 */
function renderService(service: Service): string {
    if (service.type === "generic") {
        return renderGenericService(service as GenericService);
    } else {
        return renderFixedService(service as FixedService);
    }
}

/**
 * Converts an array of Library objects to LLM-friendly Ballerina syntax string.
 */
export function toSyntaxString(libraries: Library[]): string {
    const output: string[] = [];

    for (const lib of libraries) {
        // Library header
        output.push(`// ============================================================`);
        output.push(`// Library: ${lib.name}`);
        if (lib.description) {
            output.push(`// ${lib.description.split("\n")[0]}`);
        }
        output.push(`// ============================================================`);
        output.push(`import ${lib.name};`);

        // Instructions (prepended if present)
        if (lib.instructions) {
            output.push("");
            output.push(lib.instructions);
        }

        // README (prepended if present)
        if (lib.readme) {
            output.push("");
            output.push("// --- README ---");
            output.push(lib.readme);
            output.push("// --- END README ---");
        }

        // Types section
        if (lib.typeDefs && lib.typeDefs.length > 0) {
            output.push("");
            output.push("// --- Types ---");
            for (const typeDef of lib.typeDefs) {
                output.push("");
                output.push(renderTypeDef(typeDef));
            }
        }

        // Client section
        if (lib.clients && lib.clients.length > 0) {
            output.push("");
            output.push("// --- Client ---");
            for (const client of lib.clients) {
                output.push("");
                output.push(renderClient(client));
            }
        }

        // Functions section
        if (lib.functions && lib.functions.length > 0) {
            output.push("");
            output.push("// --- Functions ---");
            for (const func of lib.functions) {
                output.push("");
                output.push(renderStandaloneFunction(func));
            }
        }

        // Service section
        if (lib.services && lib.services.length > 0) {
            output.push("");
            output.push("// --- Service ---");
            output.push(...renderServiceAlternativesNote(lib.services));
            for (const service of lib.services) {
                output.push("");
                output.push(renderService(service));
            }
        }

        // Annotation section
        if (lib.annotations && lib.annotations.length > 0) {
            const renderedAnnotations = renderAnnotationDeclarations(lib.annotations);
            if (renderedAnnotations.length > 0) {
                output.push("");
                output.push("// --- Annotations ---");
                for (const rendered of renderedAnnotations) {
                    output.push("");
                    output.push(rendered);
                }
            }
        }

        output.push("");
    }

    return output.join("\n");
}
