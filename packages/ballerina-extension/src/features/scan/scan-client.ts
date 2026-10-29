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

import { ExtendedLangClient } from "../../core";

/** Issue as returned by `scanner/scan`; the fields match the `bal scan` HTML report. */
export interface ScanIssue {
    ruleID: string;
    name: string;
    ruleKind: "CODE_SMELL" | "BUG" | "VULNERABILITY" | string;
    severity?: string;
    issueType: string;
    message: string;
    details?: string;
    helpUri?: string;
    tags?: string[];
    cwe?: number[];
    owasp?: { year: number; categories: number[] }[];
    filePath: string;
    textRange: TextRange;
    /** Alternative ways to suppress the issue with `@scan:Suppress`, innermost first; absent on suppressed issues. */
    suppressFixes?: SuppressFix[];
    suppression?: { justification?: string; rules?: string[] };
    /** The `@scan:Suppress` that would suppress the issue if Scan.toml did not disable suppressions. */
    inactiveSuppression?: { justification?: string; rules?: string[] };
    /** The action that turns suppressions back on; present with `inactiveSuppression`. */
    enableSuppressions?: { title: string; note: string };
}

export interface TextRange {
    startLine: number;
    startLineOffset: number;
    endLine: number;
    endLineOffset: number;
}

/** Edits that place `@scan:Suppress` on one construct, restructuring the statement first when it needs that. */
export interface SuppressFix {
    construct: string;
    title: string;
    edits: ScanTextEdit[];
}

/** A text edit against the scanned file; a snippet edit uses the snippet syntax for where the reason goes. */
export interface ScanTextEdit {
    textRange: TextRange;
    newText: string;
    snippet: boolean;
}

/** A problem with a `@scan:Suppress` annotation, such as one that matches no issue. */
export interface SuppressionProblem {
    severity: "ERROR" | "WARNING" | string;
    message: string;
    filePath: string;
    textRange: TextRange;
}

export interface ScannedPackage {
    path: string;
    name: string;
    issues: ScanIssue[];
    suppressedIssues?: ScanIssue[];
    suppressionDiagnostics?: SuppressionProblem[];
    /** False when `[suppression] enabled = false` in Scan.toml makes the scan ignore `@scan:Suppress`. */
    suppressionEnabled?: boolean;
    skippedReason?: string;
    reportPath?: string;
}

export interface ScanResponse {
    success: boolean;
    packages?: ScannedPackage[];
    code?: string;
    error?: string;
}

export interface HandshakeResponse {
    available: boolean;
    toolVersion?: string;
    apiVersion?: number;
    supportedApiVersion: number;
    code?: string;
    error?: string;
}

export interface ScanTomlEditResponse {
    success: boolean;
    ruleId?: string;
    path?: string;
    exists?: boolean;
    changed?: boolean;
    content?: string;
    code?: string;
    error?: string;
}

const METHOD_NOT_FOUND = -32601;

/** Thin wrapper over the language server's `scanner/*` requests. */
export class ScanClient {
    constructor(private readonly langClient: () => ExtendedLangClient | undefined) {}

    /** Returns undefined when the language server predates the scanner service. */
    async handshake(): Promise<HandshakeResponse | undefined> {
        try {
            return await this.client().sendRequest<HandshakeResponse>("scanner/handshake");
        } catch (error) {
            if ((error as { code?: number })?.code === METHOD_NOT_FOUND) {
                return undefined;
            }
            throw error;
        }
    }

    scan(projectPath: string, report: boolean, offline: boolean): Promise<ScanResponse> {
        return this.client().sendRequest<ScanResponse>("scanner/scan", { projectPath, offline, report });
    }

    excludeRuleEdit(projectPath: string, ruleId: string): Promise<ScanTomlEditResponse> {
        return this.client().sendRequest<ScanTomlEditResponse>("scanner/excludeRuleEdit", { projectPath, ruleId });
    }

    includeRuleEdit(projectPath: string, ruleId: string): Promise<ScanTomlEditResponse> {
        return this.client().sendRequest<ScanTomlEditResponse>("scanner/includeRuleEdit", { projectPath, ruleId });
    }

    enableSuppressionEdit(projectPath: string): Promise<ScanTomlEditResponse> {
        return this.client().sendRequest<ScanTomlEditResponse>("scanner/enableSuppressionEdit", { projectPath });
    }

    private client(): ExtendedLangClient {
        const client = this.langClient();
        if (!client) {
            throw new Error("The Ballerina language server is not running.");
        }
        return client;
    }
}
