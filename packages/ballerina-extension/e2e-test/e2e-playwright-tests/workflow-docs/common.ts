/**
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.org)
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

import * as fs from 'fs';
import * as path from 'path';
import { FrameLocator, Locator } from '@playwright/test';
import { newProjectPath } from '../utils/helpers';
import { DocJourney } from './doc-journey';
import { escapeRegExp, Integrator } from './integrator';
import { findFile } from './project';

// The articles start inside a project, so they open a template: the order project the quickstart builds plus
// the workflows and activities the articles' examples use, or the claim-handling agent project.
export const ORDER_TEMPLATE = path.join(__dirname, '..', 'data', 'workflow_order_project');
export const AGENT_TEMPLATE = path.join(__dirname, '..', 'data', 'workflow_agent_project');
// The quickstarts build their project from scratch; these are the empty projects their Step 1 creates.
export const WORKFLOW_QUICKSTART_TEMPLATE = path.join(__dirname, '..', 'data', 'workflow_quickstart_project');
export const AGENT_QUICKSTART_TEMPLATE = path.join(__dirname, '..', 'data', 'agent_quickstart_project');

export const WORKFLOW_ARTICLES = 'develop-and-test/integration-artifacts/workflow/durable-workflow';
export const AGENT_ARTICLES = 'develop-and-test/integration-artifacts/workflow/durable-agentic-workflow';
export const QUICKSTARTS = 'get-started/quickstarts';

// The project's source, read fresh: one file found by name, or all of its top-level .bal files, since the designer may
// put a new artifact in a file of its own. Snippets are matched rather than whole files, so this is not
// verifyGeneratedSource.
export function projectSources(): (file?: string) => string {
    return (file?: string) => {
        if (file !== undefined) {
            const found = fs.existsSync(newProjectPath) ? findFile(newProjectPath, file) : undefined;
            return found ? fs.readFileSync(found, 'utf-8') : '';
        }
        return fs.readdirSync(newProjectPath).filter((f) => f.endsWith('.bal'))
            .map((f) => fs.readFileSync(path.join(newProjectPath, f), 'utf-8')).join('\n');
    };
}

// Waits for the project to load, then opens one of its artifacts from the sidebar.
export async function openArtifact(j: DocJourney, ui: Integrator, project: string, name: string,
    expect: string | RegExp = /Start/): Promise<FrameLocator> {
    await j.page.getByRole('treeitem', { name: new RegExp(`^${escapeRegExp(project)}`, 'i') }).first().waitFor({ state: 'visible', timeout: 180000 });
    // On a diagram page the expected text has to be on the canvas: the diagram that Create leaves open for a new
    // activity can show the workflow's name elsewhere in the view and read as arrived while the canvas is still
    // the activity's. Pages without a canvas (an overview) keep the view-wide check.
    const arrivedOn = async (frame: FrameLocator | undefined, timeoutMs: number): Promise<FrameLocator | undefined> => {
        if (!frame) {
            return undefined;
        }
        const canvas = frame.getByTestId('bi-diagram-canvas');
        if (!await canvas.isVisible().catch(() => false)) {
            return frame;
        }
        const onCanvas = canvas.getByText(expect).filter({ visible: true }).first();
        if (!await onCanvas.waitFor({ state: 'visible', timeout: timeoutMs }).then(() => true, () => false)) {
            return undefined;
        }
        // The designer opens a just-created artifact on its own, a moment after its source lands. A sidebar click
        // that arrives first shows the artifact asked for until that navigation replaces it; only a canvas that
        // holds for a while is the one the step will act on.
        await j.page.waitForTimeout(1500);
        return await onCanvas.isVisible().catch(() => false) ? frame : undefined;
    };
    const open = async (): Promise<FrameLocator | undefined> => {
        await ui.sidebar(name);
        let opened = await arrivedOn(await ui.view(expect, 20000).catch(() => undefined), 10000);
        if (!opened) {
            // Clicking the row that is already selected does not reopen it; the breadcrumb does.
            opened = await arrivedOn(await ui.crumb(name, expect).catch(() => undefined), 10000);
        }
        if (!opened) {
            // A click on the row while the tree was refreshing (a new artifact had just been created) is dropped.
            await ui.sidebar(name);
            opened = await arrivedOn(await ui.view(expect, 30000).catch(() => undefined), 20000);
        }
        return opened;
    };
    // A navigation that replaced the canvas also moved the tree's selection, so a second round's sidebar click
    // reopens the artifact.
    const opened = await open() ?? await open();
    if (!opened) {
        throw new Error(`Step ${j.stepId}: opening '${name}' did not show '${expect}' on its diagram`);
    }
    return opened;
}

// Picks the agent on a form's Durable Agentic Workflow field; a form that already shows it needs no pick. A form
// without the field is a product regression, so the step fails.
export async function selectAgent(j: DocJourney, ui: Integrator, panel: Locator, view: FrameLocator,
    agent = 'claimAgent'): Promise<void> {
    const picked = await ui.select(panel, view, 'Durable Agentic Workflow', agent).then(() => true).catch(() => false);
    if (!picked && !await panel.getByText(agent, { exact: true }).first().isVisible().catch(() => false)) {
        throw new Error(`Step ${j.stepId}: the form has no Durable Agentic Workflow field offering '${agent}'`);
    }
}
