/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { DiagnosticMessage, Imports, PropertyTypeMemberInfo, InputType } from "./bi";
import { LineRange } from "./common";


export type ListenerModel = {
    id: number;
    name: string;
    type: string;
    displayName: string;
    documentation: string;
    moduleName: string;
    orgName: string;
    version: string;
    packageName: string;
    listenerProtocol: string;
    icon: string;
    properties?: ConfigProperties;
};


/**
 * For schema-driven triggers (unified TriggerModel), `functions` and `schemaFunctions` split the
 * handlers in two: `functions` holds what exists in the user's source, `schemaFunctions` the
 * connector-shipped addable catalog (one entry per handler variant; consumed variants are removed
 * by the language server).
 */
export interface ServiceModel {
    id: number;
    name: string;
    type: string;
    displayName?: string;
    documentation?: string;
    moduleName: string;
    orgName: string;
    version: string;
    packageName: string;
    listenerProtocol: string;
    icon: string;
    properties?: ConfigProperties;
    functions?: FunctionModel[];
    schemaFunctions?: FunctionModel[];
    codedata?: CodeData;
}

export interface ServiceClassModel { // for Ballerina Service Classes
    id: number;
    name: string;
    type: string;
    properties?: ConfigProperties;
    functions?: FunctionModel[];
    codedata?: CodeData;
    documentation?: PropertyModel;
    fields?: FieldType[];
}


export interface FieldType extends ParameterModel {
    codedata: CodeData;
    isPrivate: boolean;
    isFinal: boolean;
}

/**
 * How a schema-driven trigger handler may be added to a service, and how consuming one affects the
 * addable catalog (mirrors the language server's `Repeatable`):
 * - FALSE: single instance — adding it removes only that handler from the catalog.
 * - TRUE: may be added repeatedly — never leaves the catalog (pairs with a name-editable handler).
 * - ONE_OF_GROUP: mutually exclusive within its `group` — adding any member removes every sibling
 *   (e.g. RabbitMQ onMessage / onRequest).
 * - ONE_EACH_PER_GROUP: each member of the `group` may be added once — adding one removes only that
 *   member, siblings stay (e.g. FTP per-file-format handlers).
 * - LEGACY: a deprecated variant hidden from the addable catalog by default (never offered for new
 *   development); once present in the source it displaces every NON-LEGACY schema function, ignoring
 *   `group` (e.g. FTP's onFileChange vs. its format-specific / delete handlers). Distinct LEGACY
 *   entries are independent of each other: one being present neither hides nor is hidden by another.
 */
export enum RepeatBehavior {
    FALSE = "FALSE",
    TRUE = "TRUE",
    ONE_OF_GROUP = "ONE_OF_GROUP",
    ONE_EACH_PER_GROUP = "ONE_EACH_PER_GROUP",
    LEGACY = "LEGACY",
}

/**
 * `group`/`variantLabel`/`addLabel`/`repeatable`/`nameEditable` are handler-catalog fields carried
 * by schema-driven triggers (unified TriggerModel): functions sharing a `group` are format variants
 * of one logical handler (labelled by `variantLabel`, offered under `addLabel`); `repeatable` says
 * whether/how the handler may be added more than once (see {@link RepeatBehavior}) and
 * `nameEditable: false` locks the emitted function name to the variant's.
 */
export interface FunctionModel {
    metadata?: MetaData;
    kind: "REMOTE" | "RESOURCE" | "QUERY" | "MUTATION" | "SUBSCRIPTION" | "DEFAULT" | "INIT";
    enabled: boolean;
    optional: boolean;
    editable: boolean;
    codedata?: CodeData;

    group?: string;
    variantLabel?: string;
    addLabel?: string;
    addDescription?: string;
    repeatable?: RepeatBehavior;
    nameEditable?: boolean;

    canAddParameters?: boolean;

    // accessor will be used by resource functions
    accessor?: PropertyModel;

    properties?: ConfigProperties;
    name: PropertyModel;
    parameters: ParameterModel[];
    schema?: ConfigProperties;
    returnType: ReturnTypeModel;
    documentation?: PropertyModel;
    qualifiers?: string[];
}


export interface ReturnTypeModel extends PropertyModel {
    responses?: StatusCodeResponse[];
    schema?: ConfigProperties;
}
export interface StatusCodeResponse extends PropertyModel {
    statusCode: PropertyModel;
    body: PropertyModel;
    name: PropertyModel;
    type: PropertyModel;
    headers: PropertyModel;
    mediaType: PropertyModel;
}

export enum Protocol {
    HTTP = "HTTP",
    MESSAGE_BROKER = "MESSAGE_BROKER",
    GRAPHQL = "GRAPHQL",
    FTP = "FTP",
    CDC = "CDC"
}

export interface HttpPayloadContext {
    protocol: Protocol.HTTP;
    serviceName: string;
    serviceBasePath: string;
    resourceBasePath?: string;
    resourceMethod?: string;
    resourceDocumentation?: string;
    paramDetails?: ParamDetails[];
}

export interface MessageQueuePayloadContext {
    protocol: Protocol.MESSAGE_BROKER | Protocol.CDC;
    serviceName: string;
    queueOrTopic?: string;
    messageDocumentation?: string;
}

export interface GeneralPayloadContext {
    protocol: Protocol | string;
    filterType?: string;
}

export type PayloadContext = HttpPayloadContext | MessageQueuePayloadContext | GeneralPayloadContext;

export interface ParamDetails {
    name: string;
    type: string;
    defaulValue?: string;
}

/**
 * `badge` is a short category tag shown as a chip before the function name in the service designer
 * (e.g. "Event", "Tool", "GET", "FUNC", "INIT", or a trigger-specific value like "onCreate").
 * Optional; the designer falls back to "Event" for handlers when absent.
 */
interface MetaData {
    label: string;
    description: string;
    notice?: string;
    groupNo?: number;
    groupName?: string;
    badge?: string;
}

/**
 * Payload-composition hints of schema-driven triggers, carried on the `codedata` of a payload/type
 * node: the rendered type is template({{type}} -> boundType ?? defaultType), optionally superseded
 * by an active PAYLOAD_MODIFIER's own template (e.g. stream<{{type}}, error?>). `typeIdentifier` is
 * the base identifier used when generating a wrapper type name for an included-record payload
 * binding (e.g. "KafkaAnydataConsumer" -> generated "KafkaAnydataConsumer1" in types.bal). Meaningful
 * only on a payload/type node — see `PayloadComposer` (LS) / `payloadComposer.ts` (FE).
 */
interface PayloadCodeDataHints {
    template?: string;
    defaultType?: string;
    boundType?: string;
    bindable?: boolean;
    modifier?: string;
    targetParam?: string;
    typeIdentifier?: string;
}

/**
 * Annotation-tree hints (COMPLEX_FUNCTION_ANNOTATION -> MAPPING_FIELD leaves), carried on the
 * `codedata` of an annotation leaf. A leaf's rendered kind (e.g. string quoting) derives from the
 * node's types[], not codedata; `value` is the literal an ENUM_LITERAL choice branch emits (qualified
 * by `valueQualifier`, see {@link CodeData}). Meaningful only on an annotation leaf — see
 * `AnnotationEmitter` (LS) / `AnnotationConfigSection.tsx` (FE).
 */
interface AnnotationCodeDataHints {
    field?: string;
    optional?: boolean;
    value?: string;
}

/**
 * `nameEditable` says whether the bound parameter's identifier may be renamed in the edit UI. Unset
 * defaults to editable; false for connectors that bind to a fixed, structural identifier (e.g.
 * kafka's `records`, a CDC `before`/`after`) where only the bound type is user-selected.
 */
interface CodeData extends PayloadCodeDataHints, AnnotationCodeDataHints {
    lineRange?: LineRange;
    type?: string;
    argType?: string;
    originalName?: string;
    orgName?: string;
    packageName?: string;
    moduleName?: string;
    version?: string;
    position?: number;
    path?: string;
    valueQualifier?: string;
    nameEditable?: boolean;
    driverDependency?: DriverDependency;
}

interface DriverDependency {
    groupId?: string;
    artifactId?: string;
    version?: string;
    scope?: string;
}

export type ValidationSeverity = "ERROR" | "WARNING";

/**
 * A named validation rule carried by an editable form node.
 *
 * The rule id's namespace decides where it runs: `common.*` runs both in the webview
 * (as-you-type) and on the language server (save-time re-check), `vscode.*` runs in the
 * webview only, `ls.*` on the language server only. The vocabulary is open — an unknown
 * id is skipped with a dev-console warning so newer connector models stay loadable by
 * older clients. `message` overrides the rule's default message, supporting {placeholder}
 * interpolation from `args` plus the built-ins {label} and {value}. `severity` defaults to ERROR;
 * WARNING renders inline but does not block submit.
 */
export interface ValidationRule {
    rule: string;
    args?: Record<string, unknown>;
    message?: string;
    severity?: ValidationSeverity;
}

/** A rule failure, produced client-side or returned by the LS keyed by property path. */
export interface ValidationResult {
    propertyPath: string;
    rule: string;
    message: string;
    severity: ValidationSeverity;
}

/**
 * Whether any result blocks source generation. Only ERROR does; a WARNING is returned alongside a
 * successful save and must not be mistaken for a rejection. Callers deciding whether to navigate
 * away after a save must gate on this rather than on the list being non-empty.
 */
export function hasBlockingValidationErrors(validationErrors?: ValidationResult[]): boolean {
    return (validationErrors ?? []).some((error) => error.severity === "ERROR");
}

export interface PropertyModel {
    metadata?: MetaData;
    codedata?: CodeData;
    enabled?: boolean;
    editable?: boolean;
    isHttpResponseType?: boolean;
    value?: string;
    values?: string[];
    types?: InputType[];
    isType?: boolean;
    placeholder?: string;
    defaultValue?: string | PropertyModel;
    optional?: boolean;
    advanced?: boolean;
    items?: string[];
    allowItemCreate?: boolean;
    showOptionalSuffix?: boolean;
    choices?: PropertyModel[];
    properties?: ConfigProperties;
    addNewButton?: boolean;
    httpParamType?: "QUERY" | "HEADER" | "PAYLOAD";
    diagnostics?: DiagnosticMessage[];
    imports?: Imports;
    hidden?: boolean;
    isGraphqlId?: boolean;
}

export interface ParameterModel extends PropertyModel {
    kind?: "REQUIRED" | "OPTIONAL" | "DATA_BINDING";
    type?: PropertyModel;
    name?: PropertyModel;
    headerName?: PropertyModel;
    documentation?: PropertyModel;
    bindingGroup?: string;
}


export interface ConfigProperties {
    [key: string]: PropertyModel | ParameterModel;
}

export interface ServiceInitModel {
    id: string;
    displayName: string;
    description: string;
    orgName: string;
    packageName: string;
    moduleName: string;
    version: string;
    type: string;
    icon: string;
    properties: { [key: string]: PropertyModel };
    isLocalRepository?: boolean;
}

