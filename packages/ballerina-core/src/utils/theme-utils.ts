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

/**
 * The single source of truth for reading VS Code's webview theme kind off `document.body`.
 *
 * VS Code stamps one of `vscode-light`, `vscode-dark`, `vscode-high-contrast` or
 * `vscode-high-contrast-light` onto the webview's `<body>` element and keeps it in sync with the
 * active color theme, so a class-list check here is authoritative — it doesn't need a heuristic
 * (e.g. inspecting computed colors) to infer light vs. dark.
 */

/** True for `vscode-light` and `vscode-high-contrast-light` — the two light-background kinds. */
export function isLightTheme(): boolean {
    return typeof document !== "undefined" && (
        document.body.classList.contains("vscode-light") ||
        document.body.classList.contains("vscode-high-contrast-light")
    );
}

/** True for either high-contrast kind, regardless of whether it's the light or dark variant. */
export function isHighContrastTheme(): boolean {
    return typeof document !== "undefined" && (
        document.body.classList.contains("vscode-high-contrast") ||
        document.body.classList.contains("vscode-high-contrast-light")
    );
}
