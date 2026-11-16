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

import { ViewColumn, window, WebviewPanel, Uri } from "vscode";
import { getCommonWebViewOptions } from '../../utils';
import { render } from './render';
import { extension } from "../../BalExtensionContext";
import { SwaggerServer } from "./server";
import { CMP_TRYIT_GRAPHQL_VIEW, sendTelemetryEvent, TM_EVENT_GRAPHQL_RUN } from "../../features/telemetry";
import path from "path";


let graphqlViewPanel: WebviewPanel | undefined;

export async function showGraphqlView(serviceAPI: string): Promise<void> {
    if (graphqlViewPanel) {
        graphqlViewPanel.dispose();
    }

    // Create and show a new GraphqlView
    graphqlViewPanel = window.createWebviewPanel(
        'ballerinaGraphql',
        `Graphql Try It`,
        { viewColumn: ViewColumn.Active, preserveFocus: true },
        getCommonWebViewOptions()
    );

    graphqlViewPanel.iconPath = {
        dark: Uri.file(path.join(extension.context.extensionPath, 'resources', 'icons', 'dark-bi-graphql.svg')),
        light: Uri.file(path.join(extension.context.extensionPath, 'resources', 'icons', 'light-bi-graphql.svg'))
    };

    // Graphql Request
    // Reply on this panel's own webview: a reopen replaces the module-level panel, and request ids
    // restart per panel, so a late reply must not reach the new one. Posting to a disposed webview
    // is a no-op, while reading `.webview` off a disposed panel throws, hence the capture here.
    const webview = graphqlViewPanel.webview;
    const swaggerServer: SwaggerServer = new SwaggerServer();
    webview.onDidReceiveMessage(
        async message => {
            if (message.command !== 'graphqlRequest') {
                return;
            }
            await swaggerServer.sendRequest(message.req, true).then((response) => {
                webview.postMessage({
                    command: 'graphqlResponse',
                    id: message.id,
                    res: response
                });
            });
        }
    );

    const darkIcon = graphqlViewPanel.webview.asWebviewUri(
        Uri.file(path.join(extension.context.extensionPath, 'resources', 'icons', 'dark-bi-graphql.svg'))
    );
    const lightIcon = graphqlViewPanel.webview.asWebviewUri(
        Uri.file(path.join(extension.context.extensionPath, 'resources', 'icons', 'light-bi-graphql.svg'))
    );

    const icons = {
        dark: darkIcon.toString(),
        light: lightIcon.toString()
    };

    if (graphqlViewPanel) {
        const html = render({ serviceAPI, icons }, graphqlViewPanel.webview);
        if (html) {
            graphqlViewPanel.webview.html = html;
        }
    }
    //editor-lowcode-code-tryit
    sendTelemetryEvent(extension.ballerinaExtInstance, TM_EVENT_GRAPHQL_RUN, CMP_TRYIT_GRAPHQL_VIEW);
}
