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

import { Frame } from '@playwright/test';

/**
 * Locates the "Add Handler" button on a listener's service designer view.
 * Its markup varies (plain button, vscode-button, or a data-testid'd
 * element) depending on the connector, so every candidate shape is tried.
 * Shared by Kafka and RabbitMQ, the two listeners whose handler-add flow
 * this repo currently automates.
 */
export function locateAddHandlerButton(webview: Frame) {
    return webview.locator('button:has-text("Add Handler")').or(
        webview.locator('button:has-text("Handler")')
    ).or(
        webview.locator('vscode-button').filter({ hasText: /Add Handler|Handler/i })
    ).or(
        webview.locator('[data-testid*="add-handler"], [data-testid*="handler"]')
    );
}
