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

import { Uri, ExtensionContext, WebviewOptions, WebviewPanelOptions, Webview } from "vscode";
import { join, sep } from "path";
import { extension } from "../BalExtensionContext";
import { getProductMode } from "./config";

export const RESOURCES_CDN = `https://choreo-shared-codeserver-cdne.azureedge.net/ballerina-low-code-resources@${process.env.BALLERINA_LOW_CODE_RESOURCES_VERSION}`;
const isDevMode = process.env.WEB_VIEW_WATCH_MODE === "true";

function getWebViewResourceRoot(): string {
    return join((extension.ballerinaExtInstance.context as ExtensionContext).extensionPath,
        'resources');
}

function getNodeModulesRoot(): string {
    return join((extension.ballerinaExtInstance.context as ExtensionContext).extensionPath,
        'node_modules');
}

export function getCommonWebViewOptions(): Partial<WebviewOptions & WebviewPanelOptions> {
    return {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
            Uri.file(join((extension.ballerinaExtInstance.context as ExtensionContext).extensionPath, 'resources', 'jslibs')),
            Uri.file(getWebViewResourceRoot()),
            Uri.file(getNodeModulesRoot())
        ],
    };
}

function getVSCodeResourceURI(filePath: string, webView: Webview): string {
    return webView.asWebviewUri(Uri.file(filePath)).toString();
}

export interface WebViewOptions {
    jsFiles?: string[];
    cssFiles?: string[];
    body: string;
    scripts: string;
    styles: string;
    bodyCss?: string;
}

export function getLibraryWebViewContent(options: WebViewOptions, webView: Webview, background: string = "#fff", padding: string = "0px"): string {
    const {
        jsFiles,
        cssFiles,
        body,
        scripts,
        styles,
        bodyCss
    } = options;
    const externalScripts = jsFiles
        ? jsFiles.map(jsFile =>
            '<script charset="UTF-8" onload="loadedScript();" src="' + jsFile + '"></script>').join('\n')
        : '';
    const externalStyles = cssFiles
        ? cssFiles.map(cssFile =>
            '<link rel="stylesheet" type="text/css" href="' + cssFile + '" />').join('\n')
        : '';
    const fontDir = join(getComposerURI(webView), 'font');

    // in windows fontdir path contains \ as separator. css does not like this.
    const fontDirWithSeparatorReplaced = fontDir.split(sep).join("/");

    const isCodeServer = extension.ballerinaExtInstance.getCodeServerContext().codeServerEnv;
    const resourceRoot = isCodeServer ? RESOURCES_CDN : getVSCodeResourceURI(getWebViewResourceRoot(), webView);

    const codiconUri = webView.asWebviewUri(Uri.joinPath((extension.ballerinaExtInstance.context as ExtensionContext).extensionUri, "resources", "codicons", "codicon.css"));
    const fontsUri = webView.asWebviewUri(Uri.joinPath((extension.ballerinaExtInstance.context as ExtensionContext).extensionUri, "node_modules", "@wso2", "font-wso2-vscode", "dist", "wso2-vscode.css"));

    return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta http-equiv="X-UA-Compatible" content="IE=edge">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <link rel="stylesheet" href="${codiconUri}">
                <link rel="stylesheet" href="${fontsUri}">
                ${externalStyles}
                <style>
                    /* use this class for loader that are shown until the module js is loaded */
                    @font-face {
                        font-family: "Droid Sans Mono";
                        src: url("${fontDirWithSeparatorReplaced}/DroidSansMono.ttf") format("truetype");
                        font-weight: normal;
                        font-style: normal;
                        font-stretch: normal;
                    }
                    html {
                        overflow: hidden;
                    }
                    ${styles}
                </style>
            </head>
            
            <body class="${bodyCss}" style="background: ${background}; padding: ${padding};">
                ${body}
                <script>
                    window.productMode = ${JSON.stringify(getProductMode())};
                    ${scripts}
                </script>
                <script charset="UTF-8" src="${resourceRoot}/jslibs/webviewCommons.js"></script>
                ${externalScripts}
            </body>
            </html>
        `;
}

function getComposerURI(webView: Webview): string {
    return getVSCodeResourceURI(join((extension.ballerinaExtInstance.context as ExtensionContext).extensionPath, 'resources',
        'jslibs'), webView);
}

function getComposerCSSFiles(disableComDebug: boolean, devHost: string, webView: Webview): string[] {
    const filePath = join((extension.ballerinaExtInstance.context as ExtensionContext).extensionPath, 'resources', 'jslibs', 'themes', 'ballerina-default.min.css');
    return [
        (isDevMode && !disableComDebug) ? new URL('themes/ballerina-default.min.css', devHost).toString()
            : webView.asWebviewUri(Uri.file(filePath)).toString()
    ];
}

function getComposerJSFiles(componentName: string, disableComDebug: boolean, devHost: string, webView: Webview): string[] {
    const filePath = join((extension.ballerinaExtInstance.context as ExtensionContext).extensionPath, 'resources', 'jslibs') + sep + componentName + '.js';
    return [
        (isDevMode && !disableComDebug) ? new URL(componentName + '.js', devHost).toString()
            : webView.asWebviewUri(Uri.file(filePath)).toString(),
        isDevMode ? 'http://localhost:8097' : '' // For React Dev Tools
    ];
}

export function getComposerWebViewOptions(componentName: string, webView: Webview, { disableComDebug = false, devHost = process.env.WEB_VIEW_DEV_HOST as string } = {}): Partial<WebViewOptions> {
    return {
        cssFiles: getComposerCSSFiles(disableComDebug, devHost, webView),
        jsFiles: getComposerJSFiles(componentName, disableComDebug, devHost, webView)
    };
}
