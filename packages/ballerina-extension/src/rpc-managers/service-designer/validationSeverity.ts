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

import type { ValidationResult } from "@wso2/ballerina-core";

/**
 * Whether a wire severity blocks generation. `ValidationSeverity` is a plain Java enum, so LSP4J
 * serializes it as an ordinal (ERROR = 0) while the webview type declares the name — comparing
 * against "ERROR" alone matched nothing, which let every refusal through as a warning. Anything
 * unrecognised blocks, so a new severity fails closed rather than being silently ignored.
 */
export function isBlockingSeverity(severity: unknown): boolean {
    return severity !== "WARNING" && severity !== 1;
}

/** Restates the severity as the name the webview's `ValidationSeverity` declares. */
export function withNamedSeverity(error: ValidationResult): ValidationResult {
    return { ...error, severity: isBlockingSeverity(error.severity) ? "ERROR" : "WARNING" };
}
