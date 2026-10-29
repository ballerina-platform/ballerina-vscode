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

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

/** Shows the HTML report that `bal scan --scan-report` writes, one editor tab per package. */
export class ScanReportWebview {
    private static readonly panels = new Map<string, vscode.WebviewPanel>();

    static show(reportPath: string, packageName: string): void {
        const reportDir = path.dirname(reportPath);
        let panel = ScanReportWebview.panels.get(reportDir);
        if (panel) {
            panel.reveal(vscode.ViewColumn.Active);
        } else {
            panel = vscode.window.createWebviewPanel("ballerina.scanReport", `Scan Report: ${packageName}`,
                vscode.ViewColumn.Active, {
                    enableScripts: true,
                    localResourceRoots: [vscode.Uri.file(reportDir)]
                });
            ScanReportWebview.panels.set(reportDir, panel);
            panel.onDidDispose(() => ScanReportWebview.panels.delete(reportDir));
            panel.webview.onDidReceiveMessage((message: { type?: string; url?: string }) => {
                if (message.type === "openExternal" && message.url && /^https?:\/\//i.test(message.url)) {
                    vscode.env.openExternal(vscode.Uri.parse(message.url));
                }
            });
        }
        panel.webview.html = ScanReportWebview.toWebviewHtml(panel.webview, reportPath);
    }

    // The report links its bundle with relative paths, which only resolve from disk; the webview needs its own URIs.
    private static toWebviewHtml(webview: vscode.Webview, reportPath: string): string {
        const reportDir = path.dirname(reportPath);
        const html = fs.readFileSync(reportPath, "utf8").replace(/(src|href)="\.\/([^"]+)"/g,
            (_match, attribute: string, relativePath: string) =>
                `${attribute}="${webview.asWebviewUri(vscode.Uri.file(path.join(reportDir, relativePath)))}"`);
        const nonce = crypto.randomBytes(16).toString("base64");
        // MUI injects its styles at runtime, so styles need 'unsafe-inline'; scripts stay limited to the bundle.
        const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; `
            + `script-src ${webview.cspSource} 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; `
            + `img-src ${webview.cspSource} data:; font-src ${webview.cspSource} data:;">`;
        // The report opens links in a new tab and stops click propagation, which a webview can do neither of, so
        // external links are caught in the capture phase, before the report's handlers, and opened by the host.
        const linkHandler = `<script nonce="${nonce}">(() => {
            const vscode = acquireVsCodeApi();
            document.addEventListener("click", event => {
                const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
                const href = link ? link.getAttribute("href") : null;
                if (href && /^https?:\\/\\//i.test(href)) {
                    event.preventDefault();
                    event.stopPropagation();
                    vscode.postMessage({ type: "openExternal", url: href });
                }
            }, true);
        })();</script>`;
        return html.replace(/<head>/i, `<head>${csp}${linkHandler}`);
    }
}
