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

import { ProjectStructureArtifactResponse } from "../..";
import { LineRange } from "../../interfaces/common";

export interface ExportOASRequest {
    documentFilePath?: string;
}
export interface ExportOASResponse {
    openSpecFile: string;
}
export interface SourceUpdateResponse {
    artifacts: ProjectStructureArtifactResponse[]
}
export interface GetOASSpecRequest {
    documentFilePath?: string;
    basePath?: string;
}
export interface GetOASSpecResponse {
    spec: any | null;
}

export interface McpToolEndpoint {
    toolName: string;
    method: string;
    path: string;
    description: string;
}

export interface McpServiceDefaults {
    serviceName: string;
    version: string;
    basePath: string;
    port: number;
    listenerName: string;
}

export interface OpenApiEndpointsRequest {
    specPath: string;
}

export interface OpenApiEndpointsResponse {
    endpoints: McpToolEndpoint[];
    defaults?: McpServiceDefaults;
    errorMsg?: string;
    stacktrace?: string;
}

// ---------------------------------------------------------------------------
// GraphQL request context: the function a GraphQL service's `contextInit` names
// ---------------------------------------------------------------------------

/** Locates a GraphQL service: its file and its line range. */
export interface GraphqlContextRequest {
    filePath: string;
    codedata: {
        lineRange: LineRange;
    };
}

/** Where a context value comes from. */
export type ContextEntrySource = "header" | "query" | "value" | "expression";

/** One value the request context carries. */
export interface ContextEntry {
    key: string;
    source: ContextEntrySource;
    /** The header or query parameter name, the fixed text, or the expression's source. */
    value: string;
    /**
     * For a header or query parameter: whether a request without it is rejected. When not, the key holds `()` for
     * such a request.
     */
    required: boolean;
}

export interface GraphqlContextResponse {
    /** False for a service that is not a GraphQL service. */
    supported: boolean;
    /** Whether the service config sets `contextInit`. */
    configured: boolean;
    /** The function `contextInit` names; absent when unset or set to an expression. */
    functionName?: string;
    /** The `contextInit` value as written. */
    expression?: string;
    functionFilePath?: string;
    functionRange?: LineRange;
    /** Whether the function has the signature `contextInit` needs. */
    signatureValid: boolean;
    /** Module functions with that signature, which can be picked instead. */
    candidates: string[];
    /** The values the function sets on the context; empty when not editable. */
    entries: ContextEntry[];
    /** False when the function body is not of the shape the designer writes; it is then edited in the flow diagram. */
    editable: boolean;
    notEditableReason?: string;
    /**
     * Where in the function's file a value expression is in scope, for an expression editor's completions and
     * diagnostics. Absent when the values cannot be edited.
     */
    valueScope?: LineRange;
    errorMsg?: string;
}

export type GraphqlContextAction = "create" | "use" | "remove" | "setEntries";

export interface ApplyGraphqlContextRequest extends GraphqlContextRequest {
    action: GraphqlContextAction;
    /** For `use`: the function to point `contextInit` at. */
    functionName?: string;
    /** For `remove`: also delete the function when nothing else references it. */
    deleteFunction?: boolean;
    /** For `setEntries`: the values the context should carry, replacing the current ones. */
    entries?: ContextEntry[];
}

/** The outcome of a request context edit. */
export interface GraphqlContextEditResponse {
    errorMsg?: string;
    /** Something the edit did differently from what was asked, such as a function kept because it is still used. */
    note?: string;
}
