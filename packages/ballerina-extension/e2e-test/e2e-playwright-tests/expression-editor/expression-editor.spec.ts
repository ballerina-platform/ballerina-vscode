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

import { Locator, test } from '@playwright/test';
import path from 'path';
import {
    addArtifact,
    BI_INTEGRATOR_LABEL,
    BI_WEBVIEW_NOT_FOUND_ERROR,
    initTest,
    page,
    submitArtifactCreation
} from '../utils/helpers';
import { switchToIFrame } from '@wso2/playwright-vscode-tester';
import { Diagram, SidePanel } from '../utils/pages';

// Creates the project's *first* automation, so it needs a genuinely empty
// template rather than the shared `empty_project` (which ships a seeded
// automation so other suites can reach "Add Artifact"; see automation.spec.ts).
const AUTOMATION_CREATION_PROJECT_TEMPLATE = path.join(__dirname, '..', 'data', 'automation_creation_project');

/**
 * Click an architecture-diagram node until it actually navigates.
 *
 * These nodes (entry, connection, listener) have no onClick — component-diagram
 * wires onMouseDown/onMouseUp through useClickWithDragTolerance, which only
 * fires the handler when the pointer moved less than 5px between the two
 * events. Any layout shift mid-click therefore reads as a drag and the click is
 * dropped with no error at all, so a single attempt can silently do nothing.
 * Retry against `expected` — the thing the click is supposed to open.
 */
async function clickUntil(
    node: Locator,
    expected: Locator,
    description: string,
    attempts: number = 5
): Promise<void> {
    for (let attempt = 0; attempt < attempts; attempt++) {
        await node.click({ timeout: 15000 }).catch(() => { /* node re-rendering; retry */ });
        const opened = await expected.waitFor({ state: 'visible', timeout: 15000 })
            .then(() => true).catch(() => false);
        if (opened) {
            return;
        }
    }
    throw new Error(`Clicking the ${description} did not open the expected view after ${attempts} attempts`);
}

export default function createTests() {
    test.describe.serial('Expression Editor Tests', {
    }, async () => {
        initTest(true, true, undefined, undefined, AUTOMATION_CREATION_PROJECT_TEMPLATE);
        test('Retrieving suggestions', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Retrieving suggestions: ', testAttempt);

            // Create an automation
            await addArtifact('Automation', 'automation');

            const artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }
            // "Create" on the artifact form.
            await submitArtifactCreation(artifactWebView);

            // Submitting the form normally lands straight on the designer's canvas. When it
            // settles on the overview instead, the automation is there as an entry node, and
            // clicking that opens the same designer.
            const diagramCanvas = artifactWebView.getByTestId('bi-diagram-canvas');
            const automationNode = artifactWebView.locator('[data-testid="entry-node-automation"]');
            const landedOnDiagram = await diagramCanvas.waitFor({ timeout: 10000 })
                .then(() => true).catch(() => false);
            if (!landedOnDiagram) {
                await automationNode.waitFor({ state: 'visible', timeout: 30000 });
                await clickUntil(automationNode, diagramCanvas, 'Automation entry node');
            }

            // Add a node to the diagram
            const diagram = new Diagram(page.page);
            await diagram.init();
            await diagram.clickAddButtonByIndex(1);

            // Click on the node in the side panel
            const sidePanel = new SidePanel(artifactWebView, page.page);
            await sidePanel.init();
            await sidePanel.clickNode('Declare Variable');
        });
    });
}