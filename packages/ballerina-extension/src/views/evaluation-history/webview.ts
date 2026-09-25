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

import {
    Disposable,
    Uri,
    ViewColumn,
    Webview,
    WebviewPanel,
    window,
} from "vscode";
import * as path from "path";
import {
    WebViewOptions,
    getComposerWebViewOptions,
    getLibraryWebViewContent,
} from "../../utils/webview-utils";
import { EvaluationHistoryFilter } from "@wso2/ballerina-core";
import { RPCLayer } from "../../RPCLayer";
import { extension } from "../../BalExtensionContext";

export class EvaluationHistoryWebview {
    public static currentPanel: EvaluationHistoryWebview | undefined;
    public static readonly viewType = "ballerina.evaluation-history";
    private readonly _panel: WebviewPanel;
    private _workspaceRoot: string;
    private _disposables: Disposable[] = [];

    private constructor(panel: WebviewPanel, workspaceRoot: string) {
        this._panel = panel;
        this._workspaceRoot = workspaceRoot;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        RPCLayer.create(this._panel);
    }

    public static async createOrShow(workspaceRoot: string, filter?: EvaluationHistoryFilter): Promise<void> {
        if (EvaluationHistoryWebview.currentPanel) {
            if (filter || EvaluationHistoryWebview.currentPanel._workspaceRoot !== workspaceRoot) {
                EvaluationHistoryWebview.currentPanel._workspaceRoot = workspaceRoot;
                EvaluationHistoryWebview.currentPanel._panel.webview.html =
                    EvaluationHistoryWebview.currentPanel.getWebviewContent(
                        EvaluationHistoryWebview.currentPanel._panel.webview,
                        workspaceRoot,
                        filter
                    );
            }
            EvaluationHistoryWebview.currentPanel._panel.reveal(
                ViewColumn.Active
            );
            return;
        }

        const panel = window.createWebviewPanel(
            EvaluationHistoryWebview.viewType,
            "Evaluation History",
            ViewColumn.Active,
            {
                enableScripts: true,
                localResourceRoots: [
                    Uri.file(
                        path.join(
                            extension.context.extensionPath,
                            "resources"
                        )
                    ),
                ],
                retainContextWhenHidden: true,
            }
        );
        panel.iconPath = {
            light: Uri.file(path.join(extension.context.extensionPath, "resources", "icons", "dark-history.svg")),
            dark: Uri.file(path.join(extension.context.extensionPath, "resources", "icons", "light-history.svg")),
        };

        EvaluationHistoryWebview.currentPanel = new EvaluationHistoryWebview(
            panel,
            workspaceRoot
        );
        EvaluationHistoryWebview.currentPanel._panel.webview.html =
            EvaluationHistoryWebview.currentPanel.getWebviewContent(
                panel.webview,
                workspaceRoot,
                filter
            );
    }

    private getWebviewContent(
        webView: Webview,
        workspaceRoot: string,
        filter?: EvaluationHistoryFilter
    ): string {
        const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
        const escapedPath = escapeAttribute(workspaceRoot);
        const escapedFilter = escapeAttribute(JSON.stringify(filter ?? {}));

        const body = `<div class="container" id="webview-container" data-project-path="${escapedPath}"
                data-filter="${escapedFilter}">
                <div class="loader-wrapper">
                    <div class="loader" /></div>
                </div>
            </div>`;
        const bodyCss = ``;
        const styles = `
            .container {
                background-color: var(--vscode-editor-background);
                height: 100vh;
                width: 100%;
            }
            .loader-wrapper {
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100%;
                width: 100%;
            }
            .loader {
                width: 32px;
                aspect-ratio: 1;
                border-radius: 50%;
                border: 4px solid var(--vscode-button-background);
                animation:
                    l20-1 0.8s infinite linear alternate,
                    l20-2 1.6s infinite linear;
            }
            @keyframes l20-1{
                0%    {clip-path: polygon(50% 50%,0       0,  50%   0%,  50%    0%, 50%    0%, 50%    0%, 50%    0% )}
                12.5% {clip-path: polygon(50% 50%,0       0,  50%   0%,  100%   0%, 100%   0%, 100%   0%, 100%   0% )}
                25%   {clip-path: polygon(50% 50%,0       0,  50%   0%,  100%   0%, 100% 100%, 100% 100%, 100% 100% )}
                50%   {clip-path: polygon(50% 50%,0       0,  50%   0%,  100%   0%, 100% 100%, 50%  100%, 0%   100% )}
                62.5% {clip-path: polygon(50% 50%,100%    0, 100%   0%,  100%   0%, 100% 100%, 50%  100%, 0%   100% )}
                75%   {clip-path: polygon(50% 50%,100% 100%, 100% 100%,  100% 100%, 100% 100%, 50%  100%, 0%   100% )}
                100%  {clip-path: polygon(50% 50%,50%  100%,  50% 100%,   50% 100%,  50% 100%, 50%  100%, 0%   100% )}
            }
            @keyframes l20-2{
                0%    {transform:scaleY(1)  rotate(0deg)}
                49.99%{transform:scaleY(1)  rotate(135deg)}
                50%   {transform:scaleY(-1) rotate(0deg)}
                100%  {transform:scaleY(-1) rotate(-135deg)}
            }
        `;
        const scripts = `
            function loadedScript() {
                visualizerWebview.renderWebview("evaluation-history", document.getElementById("webview-container"));
            }
        `;

        const webViewOptions: WebViewOptions = {
            ...getComposerWebViewOptions("Visualizer", webView),
            body,
            scripts,
            styles,
            bodyCss,
        };

        return getLibraryWebViewContent(webViewOptions, webView);
    }

    public dispose(): void {
        EvaluationHistoryWebview.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) {
                d.dispose();
            }
        }
    }
}
